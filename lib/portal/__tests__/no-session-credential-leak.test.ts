/**
 * lib/portal/__tests__/no-session-credential-leak.test.ts — §3.1(a): no agent-held tenant session
 *
 * Notes:  ADDENDUM_62F §3.1 / §16.4. Source-level parity test, deliberately not a unit test — the
 *         defect it guards is a RETURN SHAPE, and the return shape is the security boundary that
 *         TypeScript cannot see. `{ success: true }` and `{ success: true, url }` are both valid
 *         action returns; only one of them hands an agent a working tenant session.
 *
 *         The bug this exists to prevent shipped and was live: generateTenantPortalLink minted a
 *         90-day token, returned `{ success: true, url }`, and the lease page rendered it with a
 *         copy button — three clicks to an agent-held tenant session, through supported features,
 *         with nothing in the audit trail that looks like an attack. Three sibling invite functions
 *         had the same intent and shape; the two returning `{ success: true }` were safe and the
 *         one returning `url` was not, and nothing marked the difference as significant.
 *
 *         So the test ENUMERATES the exported actions rather than sampling them. A fourth sibling
 *         is caught by the enumeration failing, not by a reviewer remembering this rule — which is
 *         the same coverage failure (true of what was sampled, asserted of the population) that
 *         produced the wrong "already holds" conclusion in §14.4.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const PORTAL_DIR = join(process.cwd(), "lib", "portal")

/**
 * The single sanctioned exception (§16.2 item 3): owner-only, 48h TTL, only when the tenant has no
 * email, audited as its own action. Goes to ZERO when AT lands and SMS delivery replaces it.
 * Adding a name here is a security decision — it must come with a CD ruling, not a green build.
 */
const CREDENTIAL_RETURN_ALLOWLIST = new Set(["issueTenantPortalLinkForHandover"])

/** Field names that carry, or can carry, a session credential back to the caller. */
const CREDENTIAL_FIELDS = /\b(url|token|link|actionLink|action_link|magicLink)\b\s*[,:}]/

function sourceFiles(): string[] {
  return readdirSync(PORTAL_DIR).filter(f => f.endsWith(".ts") && !f.endsWith(".d.ts"))
}

/** Exported async functions in a module, with the body from `export` to the next top-level export. */
function exportedActions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const re = /export\s+async\s+function\s+(\w+)/g
  const hits = [...src.matchAll(re)]
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index ?? 0
    const end = i + 1 < hits.length ? (hits[i + 1].index ?? src.length) : src.length
    out.push({ name: hits[i][1], body: src.slice(start, end) })
  }
  return out
}

describe("§3.1(a) — no portal action returns a session credential to its caller", () => {
  const files = sourceFiles()

  it("finds the portal actions at all (guards against a silent zero-coverage pass)", () => {
    // Without this, a moved directory or a changed extension makes every assertion below vacuous
    // and the suite goes green while checking nothing — the failure mode a parity test must not have.
    expect(files.length).toBeGreaterThan(0)
    const total = files.flatMap(f => exportedActions(readFileSync(join(PORTAL_DIR, f), "utf8")))
    expect(total.length).toBeGreaterThan(0)
  })

  it.each(sourceFiles())("%s returns no credential field from any non-allowlisted action", file => {
    const src = readFileSync(join(PORTAL_DIR, file), "utf8")

    for (const { name, body } of exportedActions(src)) {
      if (CREDENTIAL_RETURN_ALLOWLIST.has(name)) continue

      const returns = [...body.matchAll(/\breturn\s*\{([^}]*)\}/g)].map(m => m[1])
      for (const r of returns) {
        expect(
          CREDENTIAL_FIELDS.test(r + ","),
          `${file} → ${name}() returns a credential-bearing field: { ${r.trim()} }\n\n` +
            "An agent is the opposing party in a tenant's deposit dispute. A portal action must " +
            "cause the credential to be SENT to the tenant's channel of record and return " +
            "{ success: true } — never hand it back to the caller. See ADDENDUM_62F §3.1 / §16, " +
            "and copy sendPortalInvite.ts / inviteLandlord.ts. If this genuinely cannot be " +
            "delivered, it needs a CD ruling and an entry in CREDENTIAL_RETURN_ALLOWLIST.",
        ).toBe(false)
      }
    }
  })

  it("the allowlist has not grown beyond the one sanctioned hand-over path", () => {
    // §16.2 item 5: this set shrinks to empty when AT lands. It must never grow silently.
    expect([...CREDENTIAL_RETURN_ALLOWLIST]).toEqual(["issueTenantPortalLinkForHandover"])
  })

  it("sendTenantPortalLink still exists and is not the allowlisted one", () => {
    // Pins the rename: the safe function is the default path, the exception is the narrow one.
    const src = readFileSync(join(PORTAL_DIR, "inviteTenant.ts"), "utf8")
    expect(src).toContain("export async function sendTenantPortalLink")
    expect(CREDENTIAL_RETURN_ALLOWLIST.has("sendTenantPortalLink")).toBe(false)
  })
})
