/**
 * lib/portal/__tests__/no-client-portal-token.test.ts — §3.1(a), agent-surface half
 *
 * Notes:  ADDENDUM_62F §17.3. The sibling test (no-session-credential-leak) enumerates the SERVER
 *         actions under lib/portal/ and proves none returns a credential. That left a gap, and the
 *         gap was real: the `wa.me` share link in LeasePortalActions held the token in a client
 *         component and pushed it through the agent's own browser and clipboard. It was found by
 *         reading the file, not by the test — and one instance found by hand is not evidence there
 *         is only one.
 *
 *         THE INVARIANT: nothing on the AGENT surface may reference the tenant token-access route or
 *         the token table. An agent may cause a credential to be sent; it may never pass through
 *         agent-facing code.
 *
 *         WHY IT IS SCOPED TO THE AGENT SURFACE, and not "no client file anywhere". The first draft
 *         of this test forbade `wa.me`, `token=` and `navigator.clipboard` outright and produced 20+
 *         hits, all legitimate: public token-gated routes (`/approve/[token]`, `/unsubscribe/[token]`,
 *         work-order tracking), WhatsApp contact links on supplier and landlord cards, and the
 *         tenant's OWN portal handling its own access URL. Those patterns are not the defect — the
 *         defect is a TENANT PORTAL CREDENTIAL reaching AGENT-facing code. A test with 20 false
 *         positives gets an allowlist with 20 entries and then means nothing, which is how a check
 *         becomes decoration.
 *
 *         Baseline is EMPTY and stays empty: the one real violation was removed in the same change
 *         that added this test, so there is nothing to grandfather.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/** Agent- and admin-facing surfaces. The tenant's own portal is deliberately NOT in scope. */
const AGENT_ROOTS = ["app/(dashboard)", "app/(admin)", "components"]

/** Shapes that mean a tenant portal credential is present in agent-facing code. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\/tenant\/access/, why: "references the tenant token-access route — the credential URL itself" },
  { pattern: /tenant_portal_tokens/, why: "touches the portal token table from agent-facing code" },
]

/**
 * NO ALLOWLIST, deliberately. The baseline is empty — the single real violation was removed in the
 * same change that added this test — and there is no plausible reason for agent-facing code to
 * reference a tenant session credential. If one ever emerges it needs a CD ruling and an explicit
 * addition here, which is the conversation that should happen. An empty allowlist sitting in the
 * file would just be an invitation.
 */
function agentSurfaceFiles(): string[] {
  const out: string[] = []
  for (const root of AGENT_ROOTS) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (/\.(ts|tsx)$/.test(entry) && !entry.includes("__tests__")) out.push(join(root, entry))
    }
  }
  return out
}

/** Strip comments so a note explaining the REMOVAL cannot re-trigger the rule it documents. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")
}

describe("§3.1(a) agent surface — no tenant portal credential in agent-facing code", () => {
  const files = agentSurfaceFiles()

  it("actually enumerated the agent surface (§17.4: never let a check pass vacuously)", () => {
    // A moved route group or a changed glob would otherwise iterate an empty list and report safety.
    // A check that passes without checking anything is worse than no check — someone reads the green
    // and stops looking. This is the same family as "verify before you tick".
    expect(files.length).toBeGreaterThan(100)
  })

  it("no agent-facing file references the tenant token-access route or token table", () => {
    const violations: string[] = []

    for (const file of files) {
      const live = stripComments(readFileSync(file, "utf8"))
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(live)) violations.push(`${file} — ${why}`)
      }
    }

    expect(
      violations,
      `Tenant portal credential reached agent-facing code:\n  ${violations.join("\n  ")}\n\n` +
        "A tenant portal token is a session credential, and the agent is the opposing party in a " +
        "deposit dispute. The server must deliver it to the tenant's channel of record — no " +
        "agent-facing component may hold, render, copy or forward it. This is the invariant the " +
        "wa.me share link violated (ADDENDUM_62F §3.1 / §17.3). There is no allowlist by design — " +
        "if you believe a hit is safe, that needs a CD ruling, not a green build.",
    ).toEqual([])
  })
})
