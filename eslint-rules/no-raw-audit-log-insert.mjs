/**
 * eslint-rules/no-raw-audit-log-insert.mjs — audit_log rows are written through recordAudit(), not by hand
 *
 * `recordAudit()` / `recordAuditReturningId()` in lib/audit is the canonical writer (ADDENDUM_AUDIT_HARDENING
 * D-1/D-2). Two guarantees a hand-written `from("audit_log").insert(...)` does NOT have:
 *   1. It writes only the real columns — phantom `user_id`/`event_type`/`values` inserts silently 42703'd.
 *   2. PII is sanitised out of the payload before write (SECURITY RULE #7) — never a per-caller discipline.
 *
 * This flags a `.insert(...)` (or `.upsert(...)`) chained off `from("audit_log")` — a WRITE. Reads/selects
 * from audit_log (admin audit views) are fine and not flagged. lib/audit is the implementation. The ~78
 * pre-existing writers are baselined and burning down — remove a file as it routes through recordAudit; a
 * new raw write in any other file fails immediately. Baselines only shrink.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-raw-audit-log-insert.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

const WRITE_METHODS = new Set(["insert", "upsert"])

/** Does this member-expression's object chain include `.from("audit_log")`? */
function fromAuditLog(node) {
  // node is the object of a `.insert`/`.upsert` member expression. Walk down through .from("audit_log").
  let cur = node
  while (cur) {
    if (cur.type === "CallExpression") {
      const c = cur.callee
      if (c?.type === "MemberExpression" && c.property?.name === "from") {
        const arg = cur.arguments[0]
        if (arg?.type === "Literal" && arg.value === "audit_log") return true
      }
      cur = c?.type === "MemberExpression" ? c.object : null
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
    docs: { description: "audit_log writes go through recordAudit() from lib/audit — never a hand-written insert." },
    messages: {
      rawInsert:
        "Do not write audit_log directly. Use `recordAudit(db, { orgId, actorId, action, table, recordId, before?, after? })` from @/lib/audit/recordAudit (or recordAuditReturningId when you need the id back). It writes only the real columns and sanitises PII out of the payload (RULE #7) — a hand-rolled insert has neither guarantee. The action enum is INSERT|UPDATE|DELETE|NOTE|SYNC|OWNERSHIP_TRANSFERRED|CONFLICT_ACKNOWLEDGED.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.startsWith("lib/audit/") || file.includes("/lib/audit/")) return {}
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}

    return {
      "CallExpression > MemberExpression"(node) {
        if (node.property?.type !== "Identifier" || !WRITE_METHODS.has(node.property.name)) return
        if (node.parent.callee !== node) return   // it's the callee of the call, i.e. `.insert(...)`
        if (fromAuditLog(node.object)) {
          context.report({ node: node.property, messageId: "rawInsert" })
        }
      },
    }
  },
}

export default rule
