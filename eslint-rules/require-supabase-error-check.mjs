/**
 * eslint-rules/require-supabase-error-check.mjs — Part 1 of ADDENDUM_SCHEMA_SELECT_GUARD
 *
 * Fails when an awaited Supabase query (`...from(...).select/insert/update/delete/upsert(...)`
 * or `...rpc(...)`) is destructured for `data` WITHOUT also binding `error`. A missing column
 * (42703), wrong RLS, or a stalled/timed-out connection returns `{ data: null, error }`; the
 * habitual `data ?? []` fallback then silently turns that into an empty list — a blank page
 * instead of a loud failure. This is the exact shape that produced the 12-file org-branding
 * drift. Enforces the rule CLAUDE.md already states ("SUPABASE QUERY ERROR HANDLING").
 *
 * It does NOT catch a wrong column name (that's the column-validator, Part 2) — it makes any
 * such drift LOUD in dev/CI instead of a silent empty result.
 *
 * The sibling half ("destructured `error` but never read") is already caught by
 * @typescript-eslint/no-unused-vars, so this rule only targets the missing `error` binding.
 */

/** Supabase query roots. Presence of one of these in the awaited call chain marks it a query. */
const SUPABASE_ENTRYPOINTS = new Set(["from", "rpc"])

/** Walk a call/member chain looking for a `.from(...)` or `.rpc(...)` (the Supabase roots). */
function chainHasSupabaseEntry(node) {
  let cur = node
  let depth = 0
  while (cur && depth < 50) {
    depth++
    if (cur.type === "CallExpression") {
      const callee = cur.callee
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        SUPABASE_ENTRYPOINTS.has(callee.property.name)
      ) {
        return true
      }
      cur = callee
    } else if (cur.type === "MemberExpression") {
      cur = cur.object
    } else {
      return false
    }
  }
  return false
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require binding `error` (not just `data`) when destructuring an awaited Supabase query result.",
    },
    messages: {
      missingError:
        "Supabase query destructures `data` without `error`. A missing column / RLS failure / timeout returns `{ data: null, error }`, and the `data ?? []` fallback then silently hides it (blank page, not an error). Destructure `error` and check it first — e.g. `const { data, error } = await ...; if (error) { console.error(...); return [] }`. See CLAUDE.md 'SUPABASE QUERY ERROR HANDLING'.",
    },
    schema: [],
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        // Only awaited results — excludes sync builders like storage.from(b).getPublicUrl()
        // (which legitimately returns `{ data }` with no error).
        if (!node.init || node.init.type !== "AwaitExpression") return
        const call = node.init.argument
        if (!call || call.type !== "CallExpression") return
        if (node.id.type !== "ObjectPattern") return

        const props = node.id.properties
        // A rest element (`...rest`) could capture `error` — don't flag.
        if (props.some((p) => p.type === "RestElement")) return

        const keys = props
          .filter((p) => p.type === "Property" && p.key.type === "Identifier")
          .map((p) => p.key.name)

        if (!keys.includes("data")) return // not the {data,error} shape we guard
        if (keys.includes("error")) return // already binding error — good
        if (!chainHasSupabaseEntry(call)) return // not a Supabase query

        context.report({ node: node.id, messageId: "missingError" })
      },
    }
  },
}

export default rule
