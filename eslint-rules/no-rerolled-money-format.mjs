/**
 * eslint-rules/no-rerolled-money-format.mjs — ZAR formatting goes through formatZAR (lib/constants)
 *
 * `formatZAR(cents, showCents?)` is the SSOT (130 importers). A tail of ~16 local `formatZAR`/`formatRand`/
 * `fmtZAR`/`formatAmount` copies each re-rolled `(cents/100).toLocaleString("en-ZA", { minimumFractionDigits
 * … })` with subtly different rules — 2 vs 0 decimals, NBSP vs space, abs-then-sign, k/m abbreviation — so
 * statements, receipts and PDFs disagreed on how the same amount renders.
 *
 * This is BODY-based, not name-based: it flags a `toLocaleString` whose options carry
 * `minimum/maximumFractionDigits` (the money signature — dates use day/month/year and are handled by
 * no-adhoc-dates). A local helper that DELEGATES to formatZAR passes; a re-implementation fails. Baselined
 * sites are the current re-rolls (some legitimately need a signed/abbreviated variant — fold them into
 * formatZAR when that variant lands). Baselines only shrink.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-rerolled-money-format.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

const FRACTION_KEYS = new Set(["minimumFractionDigits", "maximumFractionDigits"])

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "ZAR amounts render through formatZAR() from lib/constants — never a local toLocaleString money re-roll." },
    messages: {
      rerolled:
        "Do not format money with a raw `.toLocaleString(\"en-ZA\", { …FractionDigits })` here. Use `formatZAR(cents, showCents?)` from @/lib/constants so every statement, receipt and PDF renders an amount identically. A local helper that delegates to formatZAR is fine; a re-implementation is not.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    // The money SSOT itself, and the dates SSOT (its toLocaleString is date formatting, not money).
    if (file === "lib/constants.ts" || file.startsWith("lib/dates/") || file.includes("/lib/dates/")) return {}
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}

    return {
      "CallExpression[callee.property.name='toLocaleString']"(node) {
        const opts = node.arguments[1]
        if (opts?.type !== "ObjectExpression") return
        const isMoney = opts.properties.some((p) => FRACTION_KEYS.has(p.key?.name ?? p.key?.value))
        if (isMoney) context.report({ node, messageId: "rerolled" })
      },
    }
  },
}

export default rule
