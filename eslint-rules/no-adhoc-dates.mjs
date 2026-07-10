/**
 * eslint-rules/no-adhoc-dates.mjs — dates go through lib/dates, or they lie about the timezone
 *
 * Three checks, three postures, because the underlying operations differ:
 *
 *   1. naiveToday — `new Date().toISOString().slice(0,10)` resolves TODAY in UTC. SAST is UTC+2, so from
 *      22:00 UTC it is already tomorrow in South Africa. This shipped as a legal-date bug more than once.
 *      **NO ALLOWLIST**: every site was converted to saTodayISO(). A new one is always a bug.
 *
 *   2. isoSlice — any other `X.toISOString().slice(0,10)`. This is AMBIGUOUS by construction and cannot be
 *      decided statically: it is WRONG when X is a real instant (a timezone resolution done in UTC), and
 *      RIGHT when X is already an SA-resolved date parked at UTC midnight as a carrier (pure calendar
 *      arithmetic). lib/notices/vacateDate.ts contained both, three lines apart. Every site was read and
 *      classified; ONE is baselined (lib/observability/betterstack.ts, deliberately UTC — it bounds a
 *      log-retention window, not a legal date). A new one must be justified, not assumed.
 *
 *      A third defect class turned up during that pass and has no separate check: LOCAL-time mutators
 *      (`setDate`/`getDate`, `setMonth`, `setFullYear`, date-fns `startOfMonth`) feeding a UTC slice. The
 *      two coordinate systems coincide on Vercel and diverge everywhere else, so it is invisible in
 *      production and wrong on every dev machine. If you find one, it is a bug — see lib/dates §3.
 *
 *   3. localeWithoutTimeZone — `toLocaleDateString`/`toLocaleString` with no `timeZone` option renders in
 *      the SERVER's zone: UTC on Vercel, SAST on a dev machine. Same code, two answers. The baselined
 *      remainder is the bare-call form (`toLocaleDateString()` with no option bag), where the fix also
 *      changes the visible LOCALE and so needs a human. Use fmtDateZA / fmtDateLongZA / fmtDateTimeZA /
 *      fmtZA from @/lib/dates.
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

/** `<x>.toISOString()` → the `<x>` node, else null. */
function toISOStringReceiver(call) {
  if (call?.type !== "CallExpression") return null
  const c = call.callee
  if (c?.type !== "MemberExpression" || c.property?.name !== "toISOString") return null
  return c.object
}

/**
 * The date-truncation idiom, in BOTH its spellings:
 *   x.toISOString().slice(0, 10)
 *   x.toISOString().split("T")[0]
 *
 * The second is why an earlier "baseline zero" was false: the pattern matched one spelling, so 61 sites in
 * 31 files — twelve of them the naive-today bug — were invisible to a rule that reported clean. A lint rule
 * is only as honest as its pattern; a synonym is a blind spot, not an exception.
 *
 * Returns the receiver node (the thing being truncated), or null.
 */
function isoTruncationReceiver(node) {
  const c = node.callee
  // …toISOString().slice(0, 10)
  if (c?.type === "MemberExpression" && c.property?.name === "slice") {
    const [a, b] = node.arguments
    if (a?.value === 0 && b?.value === 10) return toISOStringReceiver(c.object)
  }
  // …toISOString().split("T")  — the [0] index is the parent MemberExpression, which we don't need
  if (c?.type === "MemberExpression" && c.property?.name === "split") {
    const [a] = node.arguments
    if (a?.value === "T") return toISOStringReceiver(c.object)
  }
  return null
}

/** `new Date()` with no arguments. */
const isBareNewDate = (n) => n?.type === "NewExpression" && n.callee?.name === "Date" && n.arguments.length === 0

const DATE_FIELDS = new Set([
  "weekday", "era", "year", "month", "day", "dayPeriod",
  "hour", "minute", "second", "fractionalSecondDigits",
  "dateStyle", "timeStyle", "timeZoneName", "calendar",
])

/**
 * Is this `toLocale*` call formatting a DATE?
 *
 * `toLocaleDateString` and `toLocaleTimeString` always are. `toLocaleString` is the ambiguous one — it is
 * also how you format money and counts (`(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })`),
 * and a NUMBER has no timezone. Flagging those was noise: 34 files in the first baseline were numeric.
 * So for `toLocaleString`, require evidence: a `new Date(...)` receiver, or a date/time field in the options.
 */
function isDateLikeLocaleCall(node) {
  const name = node.callee?.property?.name
  if (name === "toLocaleDateString" || name === "toLocaleTimeString") return true
  if (name !== "toLocaleString") return false

  if (node.callee.object?.type === "NewExpression" && node.callee.object.callee?.name === "Date") return true

  const opts = node.arguments[1]
  if (opts?.type !== "ObjectExpression") return false
  return opts.properties.some((p) => DATE_FIELDS.has(p.key?.name ?? p.key?.value))
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Dates resolve through lib/dates — never toISOString().slice(0,10) or a timezone-less toLocale*." },
    messages: {
      naiveToday:
        "`new Date().toISOString().slice(0,10)` (or `.split(\"T\")[0]`) resolves TODAY in UTC. SAST is UTC+2, so from 22:00 UTC this returns YESTERDAY's South African date — it has shipped as a legal-date bug. Use `saTodayISO()` from @/lib/dates.",
      isoSlice:
        "`.toISOString().slice(0,10)` / `.split(\"T\")[0]` is ambiguous: WRONG for a real instant (that is a timezone resolution — use `saDateISO(at)`), RIGHT only when the value is already an SA-resolved date at UTC midnight (calendar arithmetic — use `addCalendarDays()` / `calendarDate()`). Decide which, and say so. From @/lib/dates.",
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
        const receiver = isoTruncationReceiver(node)
        if (receiver) {
          if (isBareNewDate(receiver)) {
            context.report({ node, messageId: "naiveToday" })   // absolute, no allowlist
          } else if (!ISO_SLICE_OK.has(file)) {
            context.report({ node, messageId: "isoSlice" })
          }
          return
        }

        // 3 — a DATE-formatting toLocale*(…) with no timeZone. Numeric toLocaleString is not our business.
        if (node.callee?.type === "MemberExpression" && isDateLikeLocaleCall(node)) {
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
