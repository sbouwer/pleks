/**
 * eslint-rules/__tests__/no-forgeable-tier-in-gate.test.mjs — dedicated suite for M-091.
 *
 * WHY THIS RULE GETS ITS OWN FILE rather than a case in all-rules-probed.test.mjs. That harness
 * gives each rule ONE filename, shared by its violation and its known-good. This rule has three
 * independent tests for "this module decides entitlement" — `"use server"`, `app/api/`, and an
 * entitlement helper in the import list — and the first two are decided BY THE FILENAME. One
 * filename can therefore only ever probe one arm, and the two unprobed arms would be exactly the
 * silent-false-negative the harness exists to prevent. `.claude/rules/lint-rules.md`: a parity test
 * enumerates its members, it never samples them.
 *
 * The fourth case is the re-export ban, which fires at any path and is the half that keeps the path
 * match honest — a convenience `export { getOrgTier } from "./getOrgTierFromCookie"` on the
 * authoritative module would otherwise make the forgeable reader importable from a path this rule
 * does not watch.
 *
 * EVERY ARM IS PROBED IN BOTH DIRECTIONS, and each "valid" case is the same shape as its "invalid"
 * twin with one thing changed — so a passing valid case is the rule DISCRIMINATING, never the rule
 * being switched off by a path it did not recognise.
 */
import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import rule from "../no-forgeable-tier-in-gate.mjs"

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
})

const FORGEABLE = `import { getOrgTier } from "@/lib/tier/getOrgTierFromCookie"`
const CANONICAL = `import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"`

describe("pleks/no-forgeable-tier-in-gate", () => {
  it("flags the forgeable reader in an API route, and not the canonical one", () => {
    tester.run("no-forgeable-tier-in-gate", rule, {
      invalid: [
        {
          filename: "app/api/leases/preview-document/route.ts",
          code: `${FORGEABLE}\nexport async function GET(orgId) {\n  const tier = await getOrgTier(orgId)\n  if (tier === "owner") return new Response("upgrade_required", { status: 403 })\n  return new Response("ok")\n}\n`,
          errors: [{ messageId: "inGate" }],
        },
      ],
      valid: [
        // Same route, same paywall, authoritative reader. Proves the discriminator is the MODULE
        // and not "a tier read inside app/api/".
        {
          filename: "app/api/leases/preview-document/route.ts",
          code: `${CANONICAL}\nexport async function GET(orgId) {\n  const tier = await getOrgTierCanonical(orgId)\n  if (tier === "owner") return new Response("upgrade_required", { status: 403 })\n  return new Response("ok")\n}\n`,
        },
      ],
    })
  })

  it('flags it in a "use server" module, and not in a plain lib module', () => {
    tester.run("no-forgeable-tier-in-gate", rule, {
      invalid: [
        {
          filename: "lib/actions/probe.ts",
          code: `"use server"\n${FORGEABLE}\nexport async function act(orgId) {\n  return await getOrgTier(orgId)\n}\n`,
          errors: [{ messageId: "inGate" }],
        },
      ],
      valid: [
        // Byte-identical but for the directive — so the directive is provably what fired.
        {
          filename: "lib/actions/probe.ts",
          code: `${FORGEABLE}\nexport async function act(orgId) {\n  return await getOrgTier(orgId)\n}\n`,
        },
      ],
    })
  })

  it("flags it beside an entitlement helper, including when the helper is imported after it", () => {
    tester.run("no-forgeable-tier-in-gate", rule, {
      invalid: [
        // Ordering trap: the gate import comes SECOND. The rule decides at Program:exit precisely
        // so that import order cannot hide a violation.
        {
          filename: "lib/sms/probe.ts",
          code: `${FORGEABLE}\nimport { hasFeature } from "@/lib/tier/gates"\nexport async function send(orgId) {\n  return hasFeature(await getOrgTier(orgId), "sms_notifications")\n}\n`,
          errors: [{ messageId: "inGate" }],
        },
      ],
      valid: [
        // The legitimate use, and the reason the module exists: read the forgeable tier, render it.
        // If this ever starts failing, the rule has banned display and must be narrowed.
        {
          filename: "app/(dashboard)/reports/page.tsx",
          code: `${FORGEABLE}\nexport default async function Page(orgId) {\n  const tier = await getOrgTier(orgId)\n  return tier\n}\n`,
        },
      ],
    })
  })

  it("flags a re-export of the forgeable reader from any path", () => {
    tester.run("no-forgeable-tier-in-gate", rule, {
      invalid: [
        {
          filename: "lib/tier/getOrgTier.ts",
          code: `export { getOrgTier } from "./getOrgTierFromCookie"\n`,
          errors: [{ messageId: "reExport" }],
        },
        {
          filename: "lib/tier/index.ts",
          code: `export * from "./getOrgTierFromCookie"\n`,
          errors: [{ messageId: "reExport" }],
        },
      ],
      valid: [
        // Re-exporting the AUTHORITATIVE module is fine and must stay fine — the ban is specific to
        // the forgeable path, not to re-exports in general.
        { filename: "lib/tier/index.ts", code: `export * from "./getOrgTier"\n` },
      ],
    })
  })

  it("stays quiet on a gate module that never imports the forgeable reader", () => {
    tester.run("no-forgeable-tier-in-gate", rule, {
      invalid: [],
      valid: [
        // The degenerate third case: all the gate signals, none of the forgeable import. A rule that
        // flagged this would be reporting on `"use server"` rather than on the tier reader.
        {
          filename: "lib/actions/probe.ts",
          code: `"use server"\nimport { hasFeature } from "@/lib/tier/gates"\n${CANONICAL}\nexport async function act(orgId) {\n  return hasFeature(await getOrgTierCanonical(orgId), "sms_notifications")\n}\n`,
        },
      ],
    })
  })
})
