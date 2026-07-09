/**
 * lib/routing/gate.test.ts — the request-gate decision helpers (proxy.ts middleware core)
 *
 * The request gate had zero coverage. These are the pure decisions that, if wrong, silently un-gate a route
 * or mis-resolve its auth rule — the highest-assurance ROI. The load-bearing case is matchManifest's
 * longest-prefix rule: a nested authenticated route (/login/mfa) must never inherit its public parent's rule.
 */
import { describe, it, expect } from "vitest"
import {
  isWebhookPath, isApexPath, isAdminPath, matchManifest, deriveTierFromSub,
  orgCookieHasRole, extractCachedOrgId, cookieUserId,
} from "./gate"

describe("isWebhookPath — the bypass-ALL-gates list", () => {
  it("bypasses the webhook/cron/health/waitlist/status/legal routes", () => {
    for (const p of ["/api/webhooks/resend", "/api/cron/daily", "/api/health", "/api/waitlist", "/api/status/x", "/api/legal/y"]) {
      expect(isWebhookPath(p)).toBe(true)
    }
  })
  it("does NOT bypass an ordinary authenticated API/app route", () => {
    for (const p of ["/api/leases", "/dashboard", "/api/applications/x", "/leases/new"]) {
      expect(isWebhookPath(p)).toBe(false)
    }
  })
})

describe("isApexPath — marketing-host paths", () => {
  it("matches root, the apex prefixes, and their subpaths", () => {
    expect(isApexPath("/")).toBe(true)
    for (const p of ["/pricing", "/privacy", "/terms/section", "/demo", "/api/paia-manual-pdf"]) {
      expect(isApexPath(p)).toBe(true)
    }
  })
  it("does not match app-only paths", () => {
    for (const p of ["/dashboard", "/leases", "/api/leases", "/admin"]) expect(isApexPath(p)).toBe(false)
  })
  it("respects segment boundaries — a prefix-lookalike does not match", () => {
    expect(isApexPath("/pricingx")).toBe(false)   // not "/pricing" and not "/pricing/…"
  })
})

describe("isAdminPath — the HMAC-gated admin namespace", () => {
  it("matches /admin, /admin/*, /api/admin, /api/admin/*", () => {
    for (const p of ["/admin", "/admin/orgs", "/api/admin", "/api/admin/impersonate"]) expect(isAdminPath(p)).toBe(true)
  })
  it("does NOT match lookalikes (/administrator, /api/administration) or ordinary routes", () => {
    expect(isAdminPath("/administrator")).toBe(false)
    expect(isAdminPath("/api/administration")).toBe(false)
    expect(isAdminPath("/dashboard")).toBe(false)
  })
})

describe("matchManifest — longest prefix wins (the load-bearing gate resolution)", () => {
  it("resolves the exact rule for a known route", () => {
    expect(matchManifest("/login")).toEqual({ auth: false })
  })
  it("SECURITY: a nested authenticated route is NOT treated as its public parent", () => {
    // /login is auth:false; /login/mfa is auth:true — the longest prefix must win, or MFA becomes public.
    expect(matchManifest("/login/mfa")).toEqual({ auth: true, skipOrgCheck: true })
    expect(matchManifest("/onboarding/severed")).toEqual({ auth: true, skipOrgCheck: true })
    expect(matchManifest("/onboarding")).toEqual({ auth: false })   // parent stays public
  })
  it("a deeper subpath inherits the longest matching prefix", () => {
    expect(matchManifest("/login/mfa/challenge")).toEqual({ auth: true, skipOrgCheck: true })
  })
  it("returns null for a path with no manifest entry (public by default)", () => {
    expect(matchManifest("/totally/unlisted/route")).toBeNull()
  })
})

describe("deriveTierFromSub — effective tier (trial-aware)", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  it("null sub → owner (free)", () => expect(deriveTierFromSub(null)).toBe("owner"))
  it("active sub → its tier", () => expect(deriveTierFromSub({ tier: "growth", status: "active" })).toBe("growth"))
  it("a live, unconverted trial → the trial_tier", () => {
    expect(deriveTierFromSub({ tier: "owner", status: "trialing", trial_tier: "portfolio", trial_ends_at: future, trial_converted: false })).toBe("portfolio")
  })
  it("an EXPIRED trial → the base tier, not the trial_tier", () => {
    expect(deriveTierFromSub({ tier: "steward", status: "trialing", trial_tier: "portfolio", trial_ends_at: past, trial_converted: false })).toBe("steward")
  })
  it("a CONVERTED trial → the base tier", () => {
    expect(deriveTierFromSub({ tier: "growth", status: "trialing", trial_tier: "portfolio", trial_ends_at: future, trial_converted: true })).toBe("growth")
  })
})

describe("org-cookie parsers (the cookie trust boundary)", () => {
  it("orgCookieHasRole: true only for a parseable cookie carrying a non-empty role", () => {
    expect(orgCookieHasRole(JSON.stringify({ role: "agent", org_id: "o1" }))).toBe(true)
    expect(orgCookieHasRole(JSON.stringify({ org_id: "o1" }))).toBe(false)   // present but role-less → re-hydrate
    expect(orgCookieHasRole("not json")).toBe(false)
  })
  it("extractCachedOrgId: the org_id, else null", () => {
    expect(extractCachedOrgId(JSON.stringify({ org_id: "o1" }))).toBe("o1")
    expect(extractCachedOrgId(JSON.stringify({ role: "agent" }))).toBeNull()
    expect(extractCachedOrgId("{corrupt")).toBeNull()
  })
  it("cookieUserId: binds the cookie to a user; null on absent id / undefined / garbage", () => {
    expect(cookieUserId(JSON.stringify({ user_id: "u1" }))).toBe("u1")
    expect(cookieUserId(JSON.stringify({ org_id: "o1" }))).toBeNull()   // shared-desk guard: no id → don't trust
    expect(cookieUserId(undefined)).toBeNull()
    expect(cookieUserId("garbage")).toBeNull()
  })
})
