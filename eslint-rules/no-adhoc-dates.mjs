/**
 * eslint-rules/no-adhoc-dates.mjs — dates go through lib/dates, or they lie about the timezone
 *
 * Three checks, three postures, because the underlying operations differ:
 *
 *   1. naiveToday — `new Date().toISOString().slice(0,10)` resolves TODAY in UTC. SAST is UTC+2, so from
 *      22:00 UTC it is already tomorrow in South Africa. This shipped as a legal-date bug more than once.
 *      **NO ALLOWLIST**: all 21 sites were converted to saTodayISO(). A new one is always a bug.
 *
 *   2. isoSlice — any other `X.toISOString().slice(0,10)`. This is AMBIGUOUS by construction and cannot be
 *      decided statically: it is WRONG when X is a real instant (a timezone resolution done in UTC), and
 *      RIGHT when X is already an SA-resolved date parked at UTC midnight as a carrier (pure calendar
 *      arithmetic). lib/notices/vacateDate.ts contained both, three lines apart. The 42 surviving sites were
 *      read and audited as arithmetic; they are baselined. A new one must be justified, not assumed.
 *
 *   3. localeWithoutTimeZone — `toLocaleDateString`/`toLocaleString` with no `timeZone` option renders in
 *      the SERVER's zone: UTC on Vercel, SAST on a dev machine. Same code, two answers. 189 files are
 *      baselined and burning down; use fmtDateZA / fmtDateLongZA / fmtDateTimeZA from @/lib/dates.
 *
 * Baselines only SHRINK. Remove a file as you fix it. A centre without a lint rule is a suggestion.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const baseline = JSON.parse(readFileSync(join(here, "no-adhoc-dates.baseline.json"), "utf8"))
const ISO_SLICE_OK = new Set(baseline.isoSlice)
const LOCALE_OK = new Set(baseline.localeWithoutTimeZone)

/**
 * Repo-relative, forward-slashed. Derived from cwd rather than a hardcoded list of top-level
 * directories — an earlier version cut only at /lib/, /app/ and /components/, so `test/**` never matched
 * its baseline entry and the rule fired on files it had already been told about.
 */
const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** `<callee>.slice(0, 10)` where callee is `<x>.toISOString()` → returns the `<x>` node, else null. */
function isoSliceReceiver(node) {
  const c = node.callee
  if (c?.type !== "MemberExpression" || c.property?.name !== "slice") return null
  const [a, b] = node.arguments
  if (a?.value !== 0 || b?.value !== 10) return null
  const inner = c.object
  if (inner?.type !== "CallExpression") return null
  const ic = inner.callee
  if (ic?.type !== "MemberExpression" || ic.property?.name !== "toISOString") return null
  return ic.object
}

/** `new Date()` with no arguments. */
const isBareNewDate = (n) => n?.type === "NewExpression" && n.callee?.name === "Date" && n.arguments.length === 0

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Dates resolve through lib/dates — never toISOString().slice(0,10) or a timezone-less toLocale*." },
    messages: {
      naiveToday:
        "`new Date().toISOString().slice(0,10)` resolves TODAY in UTC. SAST is UTC+2, so from 22:00 UTC this returns YESTERDAY's South African date — it has shipped as a legal-date bug. Use `saTodayISO()` from @/lib/dates.",
      isoSlice:
        "`.toISOString().slice(0,10)` is ambiguous: WRONG for a real instant (that is a timezone resolution — use `saDateISO(at)`), RIGHT only when the value is already an SA-resolved date at UTC midnight (calendar arithmetic — use `addCalendarDays()` / `calendarDate()`). Decide which, and say so. From @/lib/dates.",
      localeWithoutTimeZone:
        "`toLocaleDateString`/`toLocaleString` without a `timeZone` renders in the SERVER's timezone — UTC on Vercel, SAST on your machine. Use `fmtDateZA` / `fmtDateLongZA` / `fmtDateTimeZA` from @/lib/dates, or pass `timeZone: SA_TIMEZONE`.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.includes("lib/dates/")) return {}   // the module itself IS the implementation

    return {
      CallExpression(node) {
        // 1 + 2 — .toISOString().slice(0, 10)
        const receiver = isoSliceReceiver(node)
        if (receiver) {
          if (isBareNewDate(receiver)) {
            context.report({ node, messageId: "naiveToday" })   // absolute, no allowlist
          } else if (!ISO_SLICE_OK.has(file)) {
            context.report({ node, messageId: "isoSlice" })
          }
          return
        }

        // 3 — toLocale*(…) with no timeZone in the options object
        const c = node.callee
        if (c?.type === "MemberExpression" &&
            (c.property?.name === "toLocaleDateString" || c.property?.name === "toLocaleString")) {
          if (LOCALE_OK.has(file)) return
          const opts = node.arguments[1]
          const hasTz = opts?.type === "ObjectExpression" &&
            opts.properties.some((p) => p.key?.name === "timeZone" || p.key?.value === "timeZone")
          if (!hasTz) context.report({ node, messageId: "localeWithoutTimeZone" })
        }
      },
    }
  },
}

export default rule
