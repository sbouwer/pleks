/**
 * eslint-rules/no-forgeable-tier-in-gate.mjs — M-091. The forgeable tier may not reach a gate.
 *
 * `lib/tier/getOrgTierFromCookie` reads the `pleks_org` cookie. That cookie is plain JSON, unsigned,
 * and `getServerOrgMembership` validates only that its `user_id` matches the authenticated user — so
 * `tier` is whatever the caller says it is. It is a DISPLAY value: a plan badge, a feature hint, a
 * layout choice. Gate a capability on it and the caller grants themselves the capability.
 *
 * ⚠ THIS RULE IS A PATH MATCH ON PURPOSE, AND THAT IS THE ONLY REASON IT CAN EXIST. Until
 * 2026-08-23 all three tier readers were exported from one module, so a rule could only tell the
 * forgeable one from the two authoritative ones by IMPORTED NAME — `getOrgTier` forbidden,
 * `getOrgTierCanonical` and `getOrgTierAny` fine, one substring apart and one a strict prefix of the
 * others. Token-anchored discriminators are the failure this repo has now hit four times
 * (`bash-gate`'s regex rebuild, the consent-route skip lists, M-090's `{data}`-vs-`{count}`
 * aperture, and the read/write rule pair of the 2026-08-22 scar). Splitting the module first, and
 * matching on the module second, is what makes the check have no near-misses. Do not "simplify" this
 * back into a name test.
 *
 * WHAT IT FLAGS. A module that imports the forgeable reader AND is a place where decisions bind:
 * a `"use server"` module, anything under `app/api/`, or any module that also imports one of the
 * entitlement helpers in GATE_IMPORTS. Plus any RE-EXPORT of the forgeable reader from anywhere —
 * the cheap half of the check, and the half that keeps the expensive half honest, since a
 * convenience re-export from the authoritative module would silently take the path rule out of play.
 *
 * MEASURED WHEN BUILT, not predicted: eight modules imported the forgeable reader and FIVE of them
 * gated a paid capability on it — a 403 paywall on `/api/leases/preview-document`, and four
 * `hasFeature(...)` checks in front of spend (Anthropic calls, SMS, WhatsApp, AI triage). All five
 * were repointed to `getOrgTierCanonical` in the commit that added this rule. The three that remain
 * pass the value to a component for rendering.
 *
 * KNOWN JUDGEMENT SITE, deliberately NOT flagged: `app/(dashboard)/properties/page.tsx` uses the
 * forgeable tier to widen a listing scope from "mine" to "all" within the caller's own org. That is
 * a visibility choice inside one organisation rather than an entitlement, and it is left for a human
 * to rule on rather than swept in — recorded here so the absence is a decision, not an oversight.
 */

/** The forgeable module, by path. Matched on the import SPECIFIER, both alias and relative spellings. */
const FORGEABLE_SPECIFIERS = [
  "@/lib/tier/getOrgTierFromCookie",
  "./getOrgTierFromCookie",
  "../tier/getOrgTierFromCookie",
]

/**
 * Importing one of these marks the module as a place where entitlement is decided. Kept SHORT and
 * specific: a long list makes the rule fire on modules that merely sit near a gate, and a rule that
 * fires constantly is disabled within a day.
 */
const GATE_IMPORTS = new Set([
  "hasFeature",
  "requireAgentWriteAccess",
  "requireCapability",
  "canActivateLease",
  "canDowngradeTo",
  "getOrgTierCanonical",
  "getOrgTierAny",
])

function isForgeableSpecifier(value) {
  return FORGEABLE_SPECIFIERS.some((s) => value === s) || value.endsWith("/getOrgTierFromCookie")
}

/** Repo-relative, forward-slashed. Windows gives backslashes and an absolute path. */
function relPath(filename) {
  return String(filename).replace(/\\/g, "/").replace(/^.*?\/(app|lib|components|hooks)\//, "$1/")
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid the forgeable cookie tier reader in modules that decide entitlement, and forbid re-exporting it.",
    },
    messages: {
      inGate:
        "`getOrgTierFromCookie` reads the forgeable `pleks_org` cookie — a caller can set `tier` to anything. This module {{why}}, so the value would decide a capability the caller controls. Use `getOrgTierCanonical` from `@/lib/tier/getOrgTier` (or `getOrgTierAny` for the product-line-aware route guard). The cookie reader is for display surfaces only.",
      reExport:
        "Do not re-export the forgeable cookie tier reader. `pleks/no-forgeable-tier-in-gate` finds it by MODULE PATH, so a re-export makes it reachable from a path the rule does not watch — which is the whole defect this rule was split out of one module to prevent.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context.filename ?? context.getFilename())
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    let forgeableImport = null
    let gateReason = null

    // `"use server"` makes the whole module a mutation surface.
    const isUseServer = sourceCode.ast.body.some(
      (n) =>
        n.type === "ExpressionStatement" &&
        n.expression.type === "Literal" &&
        n.expression.value === "use server",
    )
    if (isUseServer) gateReason = 'is a "use server" module'
    else if (file.startsWith("app/api/")) gateReason = "is an API route"

    return {
      ImportDeclaration(node) {
        if (isForgeableSpecifier(node.source.value)) {
          forgeableImport = node
          return
        }
        if (gateReason) return
        const named = node.specifiers
          .filter((s) => s.type === "ImportSpecifier" && s.imported.type === "Identifier")
          .map((s) => s.imported.name)
        if (named.some((n) => GATE_IMPORTS.has(n))) {
          gateReason = `imports the entitlement helper \`${named.find((n) => GATE_IMPORTS.has(n))}\``
        }
      },

      // `export { getOrgTier } from ".../getOrgTierFromCookie"` and `export * from ...`.
      ExportNamedDeclaration(node) {
        if (node.source && isForgeableSpecifier(node.source.value)) {
          context.report({ node, messageId: "reExport" })
        }
      },
      ExportAllDeclaration(node) {
        if (node.source && isForgeableSpecifier(node.source.value)) {
          context.report({ node, messageId: "reExport" })
        }
      },

      // Decided at the end, because the gate import may appear AFTER the forgeable one.
      "Program:exit"() {
        if (forgeableImport && gateReason) {
          context.report({ node: forgeableImport, messageId: "inGate", data: { why: gateReason } })
        }
      },
    }
  },
}

export default rule
