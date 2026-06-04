/**
 * eslint-rules/no-popia-raw-delete.mjs — close the D-POPIA-06 raw-delete hole (ADDENDUM_ARCHIVE_VS_ERASE)
 *
 * D-POPIA-06: every delete of a POPIA-sensitive identity table must route through
 * lib/popia/erasure.ts (request-backed, retention-gated, audited). erasure.ts's header has long
 * CLAIMED ESLint enforced this — but no such rule existed, which is how `DELETE /api/landlords`
 * shipped a raw `service.from("landlords").delete()` that hard-deletes the role row (FK-fails /
 * orphans once the party has leases). This rule makes that bug class extinct: a raw
 * `.from("<restricted>").delete()` anywhere outside the erasure engine is a build error.
 *
 * Scope (this change-set): the natural-person role tables `landlords` + `tenants`. The broader
 * triage of every POPIA-sensitive table is the follow-on DeleteButton sweep (ADDENDUM §5 / D-8).
 *
 * "Remove from my list" is Archive (set deleted_at) — never .delete(). True erasure is Phase 2's
 * anonymise-shell cascade inside erasure.ts, which is the one file allowed to delete these rows.
 */

/** Role tables whose rows must never be raw-deleted outside the erasure engine. */
const RESTRICTED_TABLES = new Set(["landlords", "tenants"])

/** The only file permitted to delete restricted tables (the request-backed erasure cascade). */
const ALLOWED_SUFFIX = "lib/popia/erasure.ts"

/**
 * Walk down a `.delete()` call's object chain to find a `.from("<table>")` whose table is
 * restricted. Handles both `x.from("tenants").delete()` and `x.from("tenants").eq(...).delete()`.
 */
function restrictedTableInChain(deleteCall) {
  let node = deleteCall.callee.object
  let depth = 0
  while (node && depth < 50) {
    depth++
    if (node.type === "CallExpression") {
      const callee = node.callee
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "from" &&
        node.arguments[0]?.type === "Literal" &&
        RESTRICTED_TABLES.has(node.arguments[0].value)
      ) {
        return node.arguments[0].value
      }
      node = callee
    } else if (node.type === "MemberExpression") {
      node = node.object
    } else {
      return null
    }
  }
  return null
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid raw .from('landlords'|'tenants').delete() outside lib/popia/erasure.ts (D-POPIA-06).",
    },
    messages: {
      rawDelete:
        "Raw delete of `{{table}}` is forbidden (D-POPIA-06). To remove from active lists, ARCHIVE it (set deleted_at) — a reversible soft-delete. True POPIA erasure must route through lib/popia/erasure.ts (request-backed, retention-gated). See ADDENDUM_ARCHIVE_VS_ERASE.",
    },
    schema: [],
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename() ?? "").replaceAll("\\", "/")
    if (filename.endsWith(ALLOWED_SUFFIX)) return {}

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "delete"
        ) {
          return
        }
        const table = restrictedTableInChain(node)
        if (table) context.report({ node, messageId: "rawDelete", data: { table } })
      },
    }
  },
}

export default rule
