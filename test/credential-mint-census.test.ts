/**
 * test/credential-mint-census.test.ts — §3.1(a) enumerated by CAPABILITY, not by directory
 *
 * Auth:   n/a — a source-level parity test, no runtime
 * Data:   the source tree (app/, lib/, components/) read from disk
 * Notes:  ADDENDUM_62F §18.5. Two sibling tests already guard this invariant and BOTH are scoped by
 *         LOCATION: no-session-credential-leak enumerates exported actions under lib/portal/, and
 *         no-client-portal-token scans the agent-facing route groups. CD's finding is that
 *         `activateLeaseCascade.ts` was correctly reported as a known gap — and that the gap is not
 *         the file. It is that the enumeration is directory-scoped while the risk is
 *         capability-scoped. A directory enumeration breaks the moment a minting call lands
 *         elsewhere, which is precisely what activateLeaseCascade already demonstrates and which
 *         will happen again.
 *
 *         So this test enumerates CALLERS OF THE MINTING PRIMITIVES, wherever they live. It covers
 *         activateLeaseCascade automatically, survives file moves, and cannot be defeated by putting
 *         the next one in a new directory. The three tests are complementary, not alternatives.
 *
 *         SHAPE borrowed deliberately from credential-token-coverage.test.ts, which is the house
 *         pattern for exactly this problem: scan by shape, require every hit to be either wired or
 *         excused WITH A WRITTEN REASON, forbid a site being both, and assert the scan itself found
 *         something so it can never pass vacuously.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/** Shipped source. `test/` is excluded, so this file cannot enumerate itself. */
const SCAN_ROOTS = ["app", "lib", "components"]

/**
 * The primitives that bring a session credential into existence. Each is the START of a credential's
 * life — everything downstream is handling, and handling is what the invariant constrains.
 */
const MINT_PATTERNS: { re: RegExp; what: string }[] = [
  {
    re: /auth\.admin\.generateLink\s*\(/,
    what: "admin.generateLink — its action_link IS a working session credential",
  },
  {
    re: /from\(\s*["'`]tenant_portal_tokens["'`]\s*\)[\s\S]{0,200}?\.insert\s*\(/,
    what: "mints a tenant_portal_tokens row — a 90-day tenant session credential",
  },
]

/**
 * Minting sites that must DELIVER the credential and never return it to their caller. Membership is
 * not an exemption — every export here is checked below. `activateLeaseCascade` is the site both
 * sibling tests miss, and it is the reason this file exists.
 */
const DELIVERS = new Set([
  "lib/portal/inviteTenant.ts",
  "lib/portal/inviteLandlord.ts",
  "lib/contractors/sendPortalInvite.ts",
  "lib/leases/activateLeaseCascade.ts",
])

/**
 * Sites that legitimately RETURN a credential to a server-side caller. Both were read and classified
 * — a reason here is a decision log entry, never a way to green the build. Neither crosses a
 * client-invocable boundary, which is the property that makes them safe.
 */
const INTERNAL_RELAY: Record<string, string> = {
  "lib/leases/portalInviteLink.ts":
    "PURE ROUTING HELPER, no DB and no client boundary — it does not call generateLink itself, it " +
    "receives one as an argument (unit-testable with a mock, see __tests__/portalInviteLink.test.ts). " +
    "Returning { actionLink, mode } to its one server-side caller is the function's entire purpose; " +
    "that caller (activateLeaseCascade) then hands the link to routeAndSend for delivery to the " +
    "tenant's own channel. The credential never reaches an agent surface.",
  "lib/auth/passkeys/mint-session.ts":
    "MINTS FOR THE AUTHENTICATING USER, not for a third party. The magic link is generated and " +
    "consumed on the server in the same call and is never sent anywhere; what is returned is the " +
    "resulting session for the person who just proved possession of their own passkey. There is no " +
    "agent in this path — the tenant/agent opposition that §3.1(a) exists to prevent does not arise.",
}

/**
 * §16.2 item 3 — the single sanctioned exception: owner-only, 48h TTL, only when the tenant has NO
 * email on record, audited as its own action. Pinned by equality below, exactly as the sibling test
 * pins it, so growing either copy fails a test rather than passing silently. Goes to ZERO when AT
 * lands and SMS delivery replaces it. Adding a name is a security decision needing a CD ruling.
 */
const CREDENTIAL_RETURN_ALLOWLIST = new Set(["issueTenantPortalLinkForHandover"])

/** Field names that carry, or can carry, a session credential back to a caller. */
const CREDENTIAL_FIELDS = /\b(url|token|link|actionLink|action_link|magicLink)\b\s*[,:}]/

/** Strip comments so a header NOTE naming a primitive is not mistaken for a call to it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")
}

function sourceFiles(): string[] {
  const out: string[] = []
  for (const root of SCAN_ROOTS) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      const p = join(root, entry).split("\\").join("/")
      if (!/\.(ts|tsx)$/.test(p)) continue
      if (p.includes("__tests__") || /\.(test|dbtest)\.tsx?$/.test(p)) continue
      out.push(p)
    }
  }
  return out
}

/** Every file that calls a minting primitive, mapped to which primitives it calls. */
function mintSites(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of sourceFiles()) {
    const live = stripComments(readFileSync(file, "utf8"))
    const hits = MINT_PATTERNS.filter(m => m.re.test(live)).map(m => m.what)
    if (hits.length > 0) found.set(file, hits)
  }
  return found
}

/**
 * Exported functions with their bodies, sliced between consecutive declarations.
 *
 * ⚠ THE MODULE BOUNDARY IS THE SECURITY BOUNDARY — and the first draft of this test got that wrong
 * in an instructive way. It sliced on every named function, reasoning that activateLeaseCascade's
 * mint sits ~90 lines above the module's only export. That fired, and the hit was NOT a leak: the
 * credential-shaped return belongs to an inline arrow adapter nested inside stepSendPortalInvite,
 * normalising Supabase's response shape for generatePortalInviteLink. stepSendPortalInvite itself
 * returns { step, status, detail }, and the link goes on to routeAndSend for delivery to the
 * tenant's own channel. Attributing a closure's return to its enclosing function is not what "this
 * function returns X" means.
 *
 * A nested closure cannot be called from outside the module, so it cannot hand anything to an agent.
 * What CAN is an export. Scoping to exports is therefore the correct unit — and it costs nothing
 * here, because what closed the activateLeaseCascade gap is this file being enumerated BY CAPABILITY
 * at all, not by which functions inside it get sliced.
 */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const hits = [...src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index ?? 0
    const end = i + 1 < hits.length ? (hits[i + 1].index ?? src.length) : src.length
    out.push({ name: hits[i][1], body: src.slice(start, end) })
  }
  return out
}

describe("§18.5 — credential minting, enumerated by capability rather than by directory", () => {
  const sites = mintSites()

  it("actually found minting sites (never let the scan pass vacuously)", () => {
    // A renamed primitive, a moved root or a changed extension would otherwise iterate nothing and
    // report safety. Same guard as the two siblings and as credential-token-coverage.
    expect(sourceFiles().length).toBeGreaterThan(100)
    expect(sites.size).toBeGreaterThan(0)
  })

  it("every minting site is classified — delivering, or an excused internal relay", () => {
    const unclassified = [...sites.entries()]
      .filter(([f]) => !DELIVERS.has(f) && !(f in INTERNAL_RELAY))
      .map(([f, what]) => `${f} — ${what.join("; ")}`)

    expect(
      unclassified,
      `A new credential-minting site appeared and is classified nowhere:\n  ${unclassified.join("\n  ")}\n\n` +
        "This test enumerates by CAPABILITY precisely so a mint in a new directory cannot slip past " +
        "the directory-scoped checks (ADDENDUM_62F §18.5). Decide which this is and say so here:\n" +
        "  • DELIVERS — it sends the credential to the subject's own channel and returns no " +
        "credential field. Add the path to DELIVERS; its returns are then checked below.\n" +
        "  • INTERNAL_RELAY — it hands the credential to a server-side caller and never crosses a " +
        "client-invocable boundary. Add it with a written reason saying WHY that holds.\n" +
        "An agent is the opposing party in a tenant's deposit dispute. Guessing here is how the " +
        "generateTenantPortalLink defect shipped.",
    ).toEqual([])
  })

  it("no site is both delivering and excused", () => {
    const both = [...DELIVERS].filter(f => f in INTERNAL_RELAY)
    expect(both, `Contradictory classification: ${both.join(", ")}`).toEqual([])
  })

  it("every relay reason is a real reason, not a placeholder", () => {
    for (const [file, reason] of Object.entries(INTERNAL_RELAY)) {
      expect(reason.trim().length, `${file}'s relay reason is too thin to have been thought about`)
        .toBeGreaterThan(40)
    }
  })

  it("every DELIVERS entry still mints — a stale entry is a silent hole", () => {
    // A DELIVERS path that no longer mints (moved, renamed, deleted) would sit here looking like
    // coverage while guarding nothing, and the real site would be caught only by the unclassified
    // test — which is the failure this suite exists to prevent, one level up.
    const stale = [...DELIVERS].filter(f => !sites.has(f))
    expect(
      stale,
      `Classified as a minting site but no longer mints:\n  ${stale.join("\n  ")}\n\n` +
        "Either the mint moved (find it — it is now unclassified somewhere else) or it is gone " +
        "(remove the entry). Do not leave the entry: it reports coverage it is not providing.",
    ).toEqual([])
  })

  it("every INTERNAL_RELAY entry still exists on disk", () => {
    // Deliberately a WEAKER check than the DELIVERS one, and the asymmetry is the point. A relay is
    // not necessarily a mint site: portalInviteLink.ts handles a credential without ever calling a
    // minting primitive, because it RECEIVES the mint function as an argument. The first draft of
    // this file asserted relays must mint, and this test caught that misclassification — which is
    // the cheapest possible demonstration that these two populations are genuinely different.
    const missing = Object.keys(INTERNAL_RELAY).filter(f => !existsSync(f))
    expect(
      missing,
      `Classified as an internal relay but the file is gone:\n  ${missing.join("\n  ")}\n\n` +
        "Remove the entry, or point it at wherever the handling moved to.",
    ).toEqual([])
  })

  it.each([...DELIVERS])("%s returns no credential field from any non-allowlisted function", file => {
    const src = stripComments(readFileSync(file, "utf8"))
    const fns = exportedFunctions(src)
    expect(fns.length, `${file}: no exported functions found — the loop below would check nothing`)
      .toBeGreaterThan(0)

    for (const { name, body } of fns) {
      if (CREDENTIAL_RETURN_ALLOWLIST.has(name)) continue

      for (const r of [...body.matchAll(/\breturn\s*\{([^}]*)\}/g)].map(m => m[1])) {
        expect(
          CREDENTIAL_FIELDS.test(r + ","),
          `${file} → ${name}() returns a credential-bearing field: { ${r.trim()} }\n\n` +
            "This function mints a session credential, so it must cause the credential to be SENT " +
            "to the subject's channel of record and return { success: true } — never hand it back. " +
            "See ADDENDUM_62F §3.1 / §16 / §18.5, and copy sendPortalInvite.ts / inviteLandlord.ts. " +
            "If it genuinely cannot be delivered, that needs a CD ruling and an entry in " +
            "CREDENTIAL_RETURN_ALLOWLIST — not a green build.",
        ).toBe(false)
      }
    }
  })

  it("the allowlist has not grown beyond the one sanctioned hand-over path", () => {
    // §16.2 item 5: this set shrinks to empty when AT lands, and must never grow silently. The
    // sibling no-session-credential-leak.test.ts pins the identical literal, so a divergence
    // between the two copies fails one of them rather than passing in both.
    expect([...CREDENTIAL_RETURN_ALLOWLIST]).toEqual(["issueTenantPortalLinkForHandover"])
  })
})
