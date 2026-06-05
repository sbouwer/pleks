/**
 * eslint-rules/require-scope-on-delete.mjs — ADDENDUM (D-8): guard cross-org / unscoped deletes
 *
 * A Supabase `.from(table).delete()` must be scoped by an org/parent key — `org_id` or any `*_id`
 * foreign key. The service client bypasses RLS, so a delete filtered by `.eq("id", x)` ALONE (or by
 * nothing at all) is a cross-org hazard: a non-guessable uuid is not an isolation boundary. This is the
 * exact shape of the F-1 bug (`deletePropertyDocument` deleted by id only → an admin of org A could
 * delete org B's document). This rule makes that class fail to compile.
 *
 * "Scoped" = the post-delete filter chain contains an `.eq`/`.in`/`.match`/… on `org_id` or a `*_id`
 * column (bare `id` does NOT count). A genuinely safe id-only delete (a creation-rollback of a row the
 * same flow just created; a row whose id came from an already-org-scoped query) is fine — annotate it:
 * `// eslint-disable-next-line pleks/require-scope-on-delete -- <why this id is already org-bound>`.
 */

const FILTER_METHODS = new Set(["eq", "in", "match", "filter", "contains", "containedBy", "or", "is", "neq"])
// org_id, or any foreign key ending in _id — but NOT the bare primary key "id".
const SCOPE_COLUMN = /(^org_id$|_id$)/

/** Walk DOWN a `.delete()` call's object chain to confirm it's a `.from("…")` (a Supabase delete). */
function isSupabaseFromDelete(deleteCall) {
  let node = deleteCall.callee.object
  let depth = 0
  while (node && depth < 60) {
    depth++
    if (node.type === "CallExpression") {
      const callee = node.callee
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && callee.property.name === "from") return true
      node = callee
    } else if (node.type === "MemberExpression") {
      node = node.object
    } else {
      return false
    }
  }
  return false
}

/** Collect the filter columns chained AFTER `.delete()` (e.g. `.delete().eq("org_id", x)`). */
function scopeColumnsAfterDelete(deleteCall) {
  const cols = []
  let current = deleteCall
  let depth = 0
  while (depth < 60) {
    depth++
    const member = current.parent
    if (!member || member.type !== "MemberExpression" || member.object !== current) break
    const call = member.parent
    if (!call || call.type !== "CallExpression" || call.callee !== member) break
    if (member.property.type === "Identifier" && FILTER_METHODS.has(member.property.name)) {
      const a0 = call.arguments[0]
      if (a0?.type === "Literal" && typeof a0.value === "string") cols.push(a0.value)
      else if (a0?.type === "ObjectExpression") {
        for (const p of a0.properties) {
          if (p.type === "Property" && p.key.type === "Identifier") cols.push(p.key.name)
        }
      }
    }
    current = call
  }
  return cols
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Require an org/parent-key scope on Supabase .delete() (the service client bypasses RLS)." },
    messages: {
      unscoped:
        "Unscoped delete: `.from(...).delete()` filtered only by id (or nothing) is a cross-org hazard — the service client bypasses RLS, so a uuid alone is not an isolation boundary (this was the F-1 bug). Scope it with `.eq(\"org_id\", orgId)` or a parent `_id`. If the id is already org-bound (creation-rollback / id from an org-scoped query), add `// eslint-disable-next-line pleks/require-scope-on-delete -- <why>`. See ADDENDUM_ARCHIVE_VS_ERASE D-8.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "delete"
        ) {
          return
        }
        if (!isSupabaseFromDelete(node)) return
        const cols = scopeColumnsAfterDelete(node)
        const scoped = cols.some((c) => c !== "id" && SCOPE_COLUMN.test(c))
        if (!scoped) context.report({ node, messageId: "unscoped" })
      },
    }
  },
}

export default rule
