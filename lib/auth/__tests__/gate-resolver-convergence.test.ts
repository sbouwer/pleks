/**
 * lib/auth/__tests__/gate-resolver-convergence.test.ts — auth termination invariant
 *
 * The integration layer the 256 pure-function tests never exercised: the gate
 * (proxy.ts) and the resolver (route.ts) feeding redirects to each other across
 * cookie hydration. Every historical ERR_TOO_MANY_REDIRECTS lived here, not in the
 * decision core. This suite runs the REAL gate + resolver with only the three
 * external dependencies mocked (updateSession, createServiceClient/createClient,
 * resolveUserMembership) and proves the termination invariant: for each
 * representative (cookie, session, route) state, re-feeding the redirect's
 * destination converges to a terminal (allow / login / 403) within 3 gate hops —
 * never an infinite gate↔resolver bounce.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import type { ActiveMembership } from "@/lib/auth/membership"
import { mintPasskeyAal, verifyPasskeyAal, PASSKEY_AAL_COOKIE } from "@/lib/auth/passkey-aal"

// ADDENDUM_69 Slice A: a real secret so the gate + resolver run the REAL passkey-AAL2
// verifier. The whole point of states 8–11 is that both sides use the SAME verifier on the
// SAME cookie+identity, so a forged/expired/foreign signal can never make them diverge (= a loop).
process.env.PASSKEY_AAL_SECRET = "convergence-test-secret-at-least-32-bytes"

// ── Hoisted mutable world the mocks read from (vi.mock factories are hoisted) ──
const h = vi.hoisted(() => ({
  state: {
    user: null as { id: string } | null,
    aal: "aal1" as "aal1" | "aal2",
    hasVerifiedFactor: false,
    membership: null as ActiveMembership | null,
    userOrgRole: null as string | null,   // what user_orgs.select("role") returns to refreshOrgCookieParallel
    welcomeSeen: true,
    onboardingState: "complete",
    everAccepted: true,
    getUserThrows: false,                  // model an expired-token gotrue throw in the resolver's getUser
    sessionId: "sess_1" as string,         // the live Supabase session_id the passkey-AAL2 signal binds to
    hasPasskey: false,                     // does the user own an enrolled passkey (user_passkeys row)?
  },
}))

function resolveTable(table: string) {
  const w = h.state
  switch (table) {
    case "user_orgs":       return { data: w.userOrgRole ? { role: w.userOrgRole } : null, error: null }
    case "subscriptions":   return { data: null, error: null }   // null → deriveTierFromSub defaults to "owner"
    case "organisations":   return { data: { type: "agency", name: "Test Co" }, error: null }
    case "user_profiles":   return { data: { onboarding_state: w.onboardingState, welcome_seen: w.welcomeSeen }, error: null }
    case "tos_acceptances": return { data: w.everAccepted ? { id: "tos_1" } : null, error: null }
    case "user_passkeys":   return { data: w.hasPasskey ? [{ id: "pk_1" }] : null, error: null }
    default:                return { data: null, error: null }
  }
}

// Chainable Supabase query-builder stub: every chain method returns the builder;
// it is awaitable and exposes single()/maybeSingle() — enough for the queries the
// gate (refreshOrgCookieParallel / agent branch) and resolver (collectResolverFacts) run.
function queryBuilder(table: string) {
  const result = () => resolveTable(table)
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "not", "order", "limit"]) b[m] = () => b
  b.single = async () => result()
  b.maybeSingle = async () => result()
  b.then = (resolve: (v: unknown) => void) => resolve(result())
  return b
}

const serviceClient = { from: (t: string) => queryBuilder(t) }

vi.mock("@/lib/supabase/middleware", () => ({
  // Runs the REAL passkey-AAL2 verifier on the request cookie + live identity, exactly like
  // the production gate — so the gate and the (real) resolver consult the same logic.
  updateSession: vi.fn(async (req: NextRequest) => {
    const passkeyOk = h.state.user
      ? verifyPasskeyAal(req.cookies.get(PASSKEY_AAL_COOKIE)?.value, {
          userId: h.state.user.id, sessionId: h.state.sessionId,
        })
      : false
    const aal = h.state.aal === "aal2" || passkeyOk ? "aal2" : h.state.aal
    return { user: h.state.user, aal, supabaseResponse: NextResponse.next() }
  }),
}))

// A crafted access_token whose payload carries the live session_id (what getSession returns to
// the resolver) so collectResolverFacts can read it via jwtIdentity.
function craftAccessToken(): string {
  const payload = Buffer.from(JSON.stringify({ sub: h.state.user?.id, session_id: h.state.sessionId })).toString("base64url")
  return `h.${payload}.s`
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => serviceClient),
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => {
        if (h.state.getUserThrows) throw new TypeError("Error in input stream")
        return { data: { user: h.state.user } }
      },
      getSession: async () => ({
        data: { session: h.state.user ? { access_token: craftAccessToken() } : null },
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: h.state.aal } }),
        listFactors: async () => ({ data: { totp: h.state.hasVerifiedFactor ? [{ status: "verified" }] : [] } }),
      },
    },
  })),
}))

vi.mock("@/lib/auth/membership", () => ({
  resolveUserMembership: vi.fn(async () => h.state.membership),
  SovereignMembershipViolation: class extends Error {},
}))

// Imported AFTER the mocks are registered.
const { proxy } = await import("@/proxy")
const { GET: resolverGET } = await import("@/app/(auth)/auth/resolver/route")

// ── Cookie-jar harness ─────────────────────────────────────────────────────────
type Jar = Record<string, string>
const ORIGIN = "https://app.pleks.co.za"

function mkReq(pathWithQuery: string, jar: Jar): NextRequest {
  const req = new NextRequest(new URL(ORIGIN + pathWithQuery))
  for (const [name, value] of Object.entries(jar)) req.cookies.set(name, value)
  return req
}

function applyCookies(jar: Jar, res: NextResponse): void {
  for (const c of res.cookies.getAll()) {
    if (c.maxAge === 0) delete jar[c.name]
    else jar[c.name] = c.value
  }
}

interface Converged { result: string; gateHops: number; trail: string[] }

/**
 * Drive the gate→(resolver)→gate cycle from `start`, carrying cookies between hops
 * exactly as a browser would. Returns when a terminal is reached or the hop budget
 * is exhausted (which only happens if the system genuinely loops).
 */
async function converge(start: string, jar: Jar): Promise<Converged> {
  let path = start
  const trail: string[] = []
  let gateHops = 0
  for (let i = 0; i < 12; i++) {
    const res = await proxy(mkReq(path, jar))
    applyCookies(jar, res)
    gateHops++
    const loc = res.headers.get("location")
    trail.push(`gate ${path} → ${loc ?? "ALLOW"}`)
    if (!loc) return { result: "allow", gateHops, trail }

    const u = new URL(loc)
    if (u.pathname === "/auth/resolver") {
      const rres = await resolverGET(mkReq("/auth/resolver" + u.search, jar))
      applyCookies(jar, rres)
      const rloc = rres.headers.get("location") ?? ""
      trail.push(`  resolver → ${rloc}`)
      path = new URL(rloc).pathname
      continue
    }
    if (u.pathname === "/login")
      return { result: u.searchParams.get("err") === "loop" ? "loop_break" : "login", gateHops, trail }
    if (u.pathname === "/403") return { result: "forbidden", gateHops, trail }
    path = u.pathname   // gate → a page directly (rare); follow it
  }
  return { result: "nonterminal_loop", gateHops, trail }
}

const AGENT: ActiveMembership = { portalClass: "agent", orgId: "org_1", orgRole: "owner" } as ActiveMembership
const orgCookie = (userId: string, role: string | null) =>
  JSON.stringify({ org_id: "org_1", role, tier: "owner", type: "agency", name: "Test Co", user_id: userId })
const hasOrgCookie = (userId: string, role?: string) =>
  JSON.stringify({ org_id: "org_1", user_id: userId, ...(role ? { role, portal_class: "agent" } : {}) })

beforeEach(() => {
  // Reset to a benign, fully-resolved agent at AAL2 unless the test overrides.
  h.state = {
    user: { id: "u1" }, aal: "aal2", hasVerifiedFactor: true, membership: AGENT,
    userOrgRole: "owner", welcomeSeen: true, onboardingState: "complete", everAccepted: true,
    getUserThrows: false, sessionId: "sess_1", hasPasskey: false,
  }
})

describe("gate ↔ resolver convergence (termination invariant)", () => {
  it("1: fresh agent, AAL2, warm cookies, /dashboard → allow in 1 hop", async () => {
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner") }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.gateHops).toBe(1)
  })

  it("2: agent AAL1 with a verified factor → routed to MFA verify, no loop", async () => {
    h.state.aal = "aal1"   // factor present, not yet stepped up
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner") }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")          // lands on /login/mfa (skipOrgCheck transient) → allowed
    expect(c.trail.some(t => t.includes("/login/mfa"))).toBe(true)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("3: agent AAL1, NO factor, past welcome → enrol island, no loop", async () => {
    h.state.aal = "aal1"; h.state.hasVerifiedFactor = false
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner") }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.trail.some(t => t.includes("/settings/security/enrol?mandatory"))).toBe(true)  // ADDENDUM_70: chooser, not enrol-totp
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("4: durable-role fallback — pleks_org role-less AND DB re-hydration empty (FIX 2)", async () => {
    // The exact residual loop: pleks_org has no readable role and refreshOrgCookieParallel's
    // user_orgs read returns nothing, but the 7-day pleks_has_org still carries the role.
    // Pre-FIX-2 the gate saw no sessionRole → to_resolver → resolver → /dashboard → loop.
    // Cookie carries ONLY role (no portal_class) so this isolates the role fallback itself:
    // remove it and the gate falls through to the no-role last resort → loop. Teeth.
    h.state.userOrgRole = null   // DB re-hydration writes no pleks_org
    const jar: Jar = { pleks_has_org: JSON.stringify({ org_id: "org_1", user_id: "u1", role: "owner" }) }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.gateHops).toBe(1)
  })

  it("5: cross-user pleks_org (shared desk) → purge + re-resolve current user, no loop", async () => {
    const jar: Jar = { pleks_org: orgCookie("intruder", "owner"), pleks_has_org: hasOrgCookie("intruder", "owner") }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.gateHops).toBeLessThanOrEqual(2)
  })

  it("6: no membership, never onboarded → onboarding (terminal), no loop", async () => {
    h.state.membership = null; h.state.userOrgRole = null
    h.state.welcomeSeen = false; h.state.onboardingState = "in_progress"
    const c = await converge("/dashboard", {})
    expect(c.result).toBe("allow")   // /onboarding is public → gate allows
    expect(c.trail.some(t => t.includes("/onboarding"))).toBe(true)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("7: deep-link straight to the enrol chooser at AAL1 (expired pleks_org) → admitted in 1 hop", async () => {
    h.state.aal = "aal1"; h.state.hasVerifiedFactor = false
    const jar: Jar = { pleks_has_org: hasOrgCookie("u1", "owner") }   // pleks_org expired away
    const c = await converge("/settings/security/enrol?mandatory=true&redirect=/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.gateHops).toBe(1)
  })

  // ── ADDENDUM_69 Slice A — passkey-AAL2 signal, loop-safety ──────────────────────
  it("8: agent, Supabase AAL1, VALID pleks_aal → allow in 1 hop (the point: no bounce)", async () => {
    h.state.aal = "aal1"   // Supabase says aal1; the passkey signal lifts it to aal2
    const aalCookie = mintPasskeyAal("u1", "sess_1")!.value
    const jar: Jar = {
      pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner"),
      [PASSKEY_AAL_COOKIE]: aalCookie,
    }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.gateHops).toBe(1)
  })

  it("9: FORGED pleks_aal → both sides AAL1 → mfa_verify, no loop, no bypass", async () => {
    h.state.aal = "aal1"
    const valid = mintPasskeyAal("u1", "sess_1")!.value
    const forged = valid.slice(0, -1) + (valid.endsWith("a") ? "b" : "a")  // tamper the signature
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner"), [PASSKEY_AAL_COOKIE]: forged }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")  // lands on /login/mfa (transient) — NOT the dashboard
    expect(c.trail.some(t => t.includes("/login/mfa"))).toBe(true)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("10: EXPIRED pleks_aal → AAL1, no loop", async () => {
    h.state.aal = "aal1"
    const expired = mintPasskeyAal("u1", "sess_1", Date.now() - 13 * 60 * 60 * 1000)!.value  // exp 1h in the past
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner"), [PASSKEY_AAL_COOKIE]: expired }
    const c = await converge("/dashboard", jar)
    expect(c.trail.some(t => t.includes("/login/mfa"))).toBe(true)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("11: pleks_aal bound to a DIFFERENT session id → AAL1 (replay defence), no loop", async () => {
    h.state.aal = "aal1"   // live session is sess_1; the cookie was minted for another session
    const foreign = mintPasskeyAal("u1", "someone-elses-session")!.value
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner"), [PASSKEY_AAL_COOKIE]: foreign }
    const c = await converge("/dashboard", jar)
    expect(c.trail.some(t => t.includes("/login/mfa"))).toBe(true)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("12: passkey-only agent at AAL1 → mfa_verify, NOT mfa_enrol (a passkey counts as a factor, ADDENDUM_69)", async () => {
    // No verified Supabase TOTP factor, but the user owns an enrolled passkey. Pre-fix the resolver
    // saw hasVerifiedFactor=false → force-enrolled them into TOTP; now collectResolverFacts reads
    // user_passkeys, so they're routed to VERIFY (where /login/mfa offers "Use a passkey instead").
    h.state.aal = "aal1"; h.state.hasVerifiedFactor = false; h.state.hasPasskey = true
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner") }
    const c = await converge("/dashboard", jar)
    expect(c.result).toBe("allow")
    expect(c.trail.some(t => t.includes("/login/mfa"))).toBe(true)         // → verify
    expect(c.trail.some(t => t.includes("/settings/security/enrol"))).toBe(false)  // NOT force-enrolled (neither chooser nor TOTP)
    expect(c.gateHops).toBeLessThanOrEqual(3)
  })

  it("loop-breaker still fires if a state ever does diverge (pleks_rdr at the limit)", async () => {
    // Force a gate→resolver bounce with the counter already at the limit: the breaker
    // must redirect to /login?err=loop and purge the org cookies rather than spin.
    h.state.aal = "aal1"          // /dashboard requiresAal2 + aal1 → gate emits to_resolver
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner"), pleks_rdr: "4" }
    const res = await proxy(mkReq("/dashboard", jar))
    expect(res.headers.get("location")).toContain("/login")
    expect(new URL(res.headers.get("location")!).searchParams.get("err")).toBe("loop")
    // org cookies purged on the breaker
    expect(res.cookies.get("pleks_org")?.value).toBe("")
    expect(res.cookies.get("pleks_has_org")?.value).toBe("")
  })

  it("every gate/resolver response stamps a reusable pleks_trace id", async () => {
    const jar: Jar = { pleks_org: orgCookie("u1", "owner"), pleks_has_org: hasOrgCookie("u1", "owner") }
    const res = await proxy(mkReq("/dashboard", jar))
    expect(res.cookies.get("pleks_trace")?.value).toMatch(/^[a-z0-9]{8}$/)
  })

  it("resolver: getUser THROWS (expired token mid-flow) → redirect to /login, not a 500", async () => {
    // collectResolverFacts → getUser() can throw "Error in input stream" when the access
    // token expired and its refresh fetch fails. The GET guard must recover to /login, never
    // bubble the throw into a 500 — /welcome's expired-session recovery bounces here.
    h.state.getUserThrows = true
    const rres = await resolverGET(mkReq("/auth/resolver?redirect=/dashboard", {}))
    expect(rres.headers.get("location")).toContain("/login")
  })
})
