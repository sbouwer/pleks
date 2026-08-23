/**
 * eslint-rules/require-supabase-error-check.mjs — Part 1 of ADDENDUM_SCHEMA_SELECT_GUARD
 *
 * Fails when an awaited Supabase query (`...from(...).select/insert/update/delete/upsert(...)`
 * or `...rpc(...)`) is destructured for ANY result field WITHOUT also binding `error`. A missing
 * column (42703), wrong RLS, or a stalled/timed-out connection returns the field null-or-zero
 * alongside an `error`; the habitual `data ?? []` fallback then silently turns that into an empty
 * list — a blank page instead of a loud failure. This is the exact shape that produced the 12-file
 * org-branding drift. Enforces the rule CLAUDE.md already states ("SUPABASE QUERY ERROR HANDLING").
 *
 * It does NOT catch a wrong column name (that's the column-validator, Part 2) — it makes any
 * such drift LOUD in dev/CI instead of a silent empty result.
 *
 * The sibling half ("destructured `error` but never read") is already caught by
 * @typescript-eslint/no-unused-vars, so this rule only targets the missing `error` binding.
 *
 * ⚠ THE APERTURE IS THE CALL, NOT THE VARIABLE NAME (widened 2026-08-23, M-090). Until then the
 * trigger was `keys.includes("data")`, so a query destructured as `{ count }` — the canonical
 * `head: true, count: "exact"` existence check — was INVISIBLE to a rule that exists for exactly
 * its defect. `lib/rules/actioned.ts` was the live instance: `const { count } = await query` then
 * `(count ?? 0) > 0`, where a DB fault reads as "not yet actioned" and the rules engine sends a
 * duplicate tenant email. Probed, not inferred — two functions differing only in the destructured
 * field, one flagged and one silent.
 *
 * The lesson generalises past this rule: a discriminator keyed on a NAME the author happened to
 * choose covers the spellings you thought of, and reports the ones you did not as clean. That is
 * the 2026-08-22 consent scar and `bash-gate`'s regex rebuild in a third costume. Anything the
 * awaited PostgREST call can return belongs in RESULT_FIELDS below; adding a field is cheap and
 * omitting one is invisible.
 */

/** Supabase query roots. Presence of one of these in the awaited call chain marks it a query. */
const SUPABASE_ENTRYPOINTS = new Set(["from", "rpc"])

/**
 * Every field an awaited PostgREST result carries. Destructuring ANY of them without `error` is the
 * defect — `data` was merely the first spelling anybody wrote. `count` is the one that bites hardest
 * (a false zero reads as "no rows", which for a dedup guard means "not done yet"), `status` and
 * `statusText` are the HTTP pair a caller reaches for when branching on the response.
 */
const RESULT_FIELDS = new Set(["data", "count", "status", "statusText"])

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

/**
 * True when `node` is a Supabase query — either the chain itself, or an identifier holding one.
 *
 * ⚠ THE IDENTIFIER ARM IS THE SECOND APERTURE HOLE (M-090, found 2026-08-23 the same day the first
 * was closed). Widening RESULT_FIELDS was not enough: `lib/rules/actioned.ts`, the very site the
 * register entry was written about, builds its query conditionally —
 *
 *     let query = supabase.from("rule_runs").select("id", { head: true, count: "exact" })
 *     if (since) query = query.gte("evaluated_at", since.toISOString())
 *     const { count } = await query
 *
 * — so the awaited argument is an Identifier and the rule returned at `type !== "CallExpression"`
 * before ever looking at the fields. Two holes, one class, and the field-name fix alone would have
 * shipped a rule that STILL missed its own motivating case while reading as built. It was caught by
 * running the widened rule over the tree and noticing the expected file was absent from its own
 * findings — an absence, which is the thing a green result never shows you.
 *
 * Resolution is scope-based and covers every write to the variable, not just its initialiser: the
 * conditional-builder shape reassigns, and reading only the declaration would reproduce the same
 * class of miss one level down.
 */
function isSupabaseQuery(node, context) {
  if (!node) return false
  if (node.type === "CallExpression" || node.type === "MemberExpression") {
    return chainHasSupabaseEntry(node)
  }
  if (node.type !== "Identifier") return false

  const sourceCode = context.sourceCode ?? context.getSourceCode()
  let scope = sourceCode.getScope ? sourceCode.getScope(node) : context.getScope()
  let variable = null
  while (scope && !variable) {
    variable = scope.variables.find((v) => v.name === node.name) ?? null
    scope = scope.upper
  }
  if (!variable) return false

  const written = [
    ...variable.defs.map((d) => (d.node?.type === "VariableDeclarator" ? d.node.init : null)),
    ...variable.references.map((r) => r.writeExpr ?? null),
  ].filter(Boolean)

  return written.some((expr) => chainHasSupabaseEntry(expr))
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
        "Supabase query destructures `{{field}}` without `error`. A missing column / RLS failure / timeout returns that field null (or `count: null`) alongside an `error`, and a `?? []` / `?? 0` fallback then silently hides it — a blank page, or a dedup guard answering 'not done yet'. Destructure `error` and check it first — e.g. `const { {{field}}, error } = await ...; if (error) { console.error(...); return [] }`. Do NOT fix a false zero by defaulting the other way; make the unreadable state a reported condition. See CLAUDE.md 'SUPABASE QUERY ERROR HANDLING'.",
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
        if (node.id.type !== "ObjectPattern") return

        const props = node.id.properties
        // A rest element (`...rest`) could capture `error` — don't flag.
        if (props.some((p) => p.type === "RestElement")) return

        const keys = props
          .filter((p) => p.type === "Property" && p.key.type === "Identifier")
          .map((p) => p.key.name)

        // Report the FIRST result field bound, in RESULT_FIELDS order rather than source order, so
        // the message names `data` on a `{ count, data }` and the wording stays stable under a
        // reorder of the pattern. A destructure binding none of them is not a result read at all.
        const field = [...RESULT_FIELDS].find((f) => keys.includes(f))
        if (!field) return // not a PostgREST result shape
        if (keys.includes("error")) return // already binding error — good
        if (!isSupabaseQuery(call, context)) return // not a Supabase query

        context.report({ node: node.id, messageId: "missingError", data: { field } })
      },
    }
  },
}

export default rule
