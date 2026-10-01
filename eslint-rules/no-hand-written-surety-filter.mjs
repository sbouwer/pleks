/**
 * eslint-rules/no-hand-written-surety-filter.mjs — "is this person a surety" is answered in ONE place
 *
 * `application_co_applicants` marks a surety TWICE: `is_surety_director = true` (the 14G declaration
 * writers) and `role = 'guarantor'` (the apply-flow roster — since BUILD_72 R1 the one surface a surety
 * enters through). `lib/applications/juristicParties.ts` owns the predicate: `isSuretyParty` in memory,
 * `SURETY_PARTY_OR_FILTER` as a PostgREST `.or(...)`.
 *
 * A query that filters on ONE marker by hand is not stricter, it is BLIND to the other writer. That is
 * M-118: billing counted `is_surety_director` alone and refused a roster-added surety at payment; then
 * the PayFast application ITN and the screen route's director set did the same after billing was fixed
 * (BUILD_72 R2). Three sites, one class, each found by reading — this rule is what stops the fourth.
 *
 * What it flags, outside the SSOT file and tests — each shape is planted in
 * `__tests__/no-hand-written-surety-filter.test.mjs`, because a list of methods in a header is a claim
 * (the first version listed `.match`/`.filter`/`.not` and caught none of them — walk F2, 2026-10-01):
 *   - a column-first filter (`.eq` / `.neq` / `.is` / `.in` / `.not` / `.filter`) whose column is
 *     `is_surety_director`, as a string OR an interpolation-free template literal;
 *   - the same on `role` when ANY later argument is, or contains, `"guarantor"` — `.eq(c, v)` puts the
 *     value second, `.filter(c, op, v)` / `.not(c, op, v)` put it third;
 *   - `.match({ … })` whose object names `is_surety_director`, or `role: "guarantor"`;
 *   - a string or template carrying a PostgREST marker clause (`is_surety_director.…`, or any
 *     `role.<op>.…guarantor…`, e.g. `role.in.(guarantor,co_applicant)`).
 * Writes are object literals (`.update({ is_surety_director: true })`) and are not flagged: the rule is
 * about READING the predicate, and both markers keep their writers (R2).
 *
 * NOT covered: an in-memory comparison (`row.role === "guarantor"`) outside `isSuretyParty` — M-118's
 * open half. NO BASELINE: at adoption (BUILD_72 Phase 0) the only two sites were fixed in the same change.
 */

const FILTER_METHODS = new Set(["eq", "neq", "is", "not", "in", "filter"])
const SSOT = "lib/applications/juristicParties.ts"
const MARKER_CLAUSE = /\bis_surety_director\.|\brole\.[a-z]+\.[^,]*\bguarantor\b/

function isExempt(file) {
  return file.endsWith(SSOT) || /\/__tests__\/|\.test\.[cm]?[jt]sx?$|\.dbtest\.ts$/.test(file)
}

/** The static string value of a Literal or an interpolation-free TemplateLiteral, else undefined. */
function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked
  return undefined
}

/** Does this argument name "guarantor" — as a literal, or inside an array of literals? */
function namesGuarantor(node) {
  if (staticString(node) === "guarantor") return true
  return node?.type === "ArrayExpression" && node.elements.some((e) => staticString(e) === "guarantor")
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Filter surety parties through SURETY_PARTY_OR_FILTER / isSuretyParty, never one marker by hand." },
    messages: {
      handWritten:
        "Hand-written surety filter. Use `SURETY_PARTY_OR_FILTER` (query) or `isSuretyParty` (in memory) from @/lib/applications/juristicParties — one marker alone is blind to the other writer (M-118, BUILD_72 R2).",
    },
    schema: [],
  },
  create(context) {
    const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
    if (isExempt(file)) return {}

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee?.type !== "MemberExpression" || callee.property?.type !== "Identifier") return
        const method = callee.property.name
        if (method === "match") {
          const obj = node.arguments[0]
          if (obj?.type !== "ObjectExpression") return
          const hit = obj.properties.some((p) => {
            const key = p.key?.type === "Identifier" ? p.key.name : staticString(p.key)
            return key === "is_surety_director" || (key === "role" && namesGuarantor(p.value))
          })
          if (hit) context.report({ node, messageId: "handWritten" })
          return
        }
        if (!FILTER_METHODS.has(method)) return
        const [column, ...rest] = node.arguments
        const col = staticString(column)
        if (col === "is_surety_director" || (col === "role" && rest.some(namesGuarantor))) {
          context.report({ node, messageId: "handWritten" })
        }
      },
      Literal(node) {
        if (typeof node.value === "string" && MARKER_CLAUSE.test(node.value)) {
          context.report({ node, messageId: "handWritten" })
        }
      },
      TemplateElement(node) {
        if (MARKER_CLAUSE.test(node.value?.cooked ?? "")) context.report({ node, messageId: "handWritten" })
      },
    }
  },
}

export default rule
