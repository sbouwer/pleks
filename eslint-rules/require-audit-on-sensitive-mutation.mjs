/**
 * eslint-rules/require-audit-on-sensitive-mutation.mjs — ADDENDUM_AUDIT_HARDENING D-4
 *
 * A file that MUTATES a Tier-1 (fraud / money / consent) table must also write an audit row in the
 * same module — either via recordAudit(...) or a raw from("audit_log").insert(...). Otherwise a
 * sensitive change (e.g. swapping payout banking) leaves no who/when. This is the enforcement half of
 * the canonical-audit work: the column-validator (check-audit-columns.mjs) proves the audits that EXIST
 * are well-formed; this rule proves the sensitive mutations HAVE one.
 *
 * Scope (deliberately tight): MUTABLE sensitive-config tables whose changes need a separate who/when
 * trail. Deliberately EXCLUDED:
 *   • append-only ledgers / records that ARE their own trail — `trust_transactions` (immutable, has the
 *     SOVEREIGN_TRUST_VIOLATION trigger), `deposit_transactions`, `consent_log` (the consent event IS
 *     the record). A second audit_log row for writing them is redundant.
 *   • `user_orgs` — mutated in ~50 files for routine session / last-seen touches; auditing "role
 *     changes" specifically needs finer-than-table-level detection (tracked: coverage test, Category 13).
 *
 * A legitimate exception (e.g. a creation-rollback that deletes a just-written row) uses an explicit
 * `// eslint-disable-next-line pleks/require-audit-on-sensitive-mutation -- <reason>` on the mutation.
 */

const T1_TABLES = new Set([
  "contact_bank_accounts", // payout banking — mutable config, the original F1 fraud vector
  "tenant_bank_accounts",  // parallel tenant banking table (D-5) — same fraud surface, same rule
])
const MUTATORS = new Set(["insert", "update", "delete", "upsert"])

/** Walk a mutator call's object chain to the `.from("literal")` table name (or null if dynamic). */
function fromTableOfMutation(call) {
  let node = call.callee.object
  let depth = 0
  while (node && depth < 50) {
    depth++
    if (node.type === "CallExpression") {
      const callee = node.callee
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "from" &&
        node.arguments[0]?.type === "Literal"
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
    docs: { description: "Require an audit write in any module that mutates a Tier-1 (fraud/money/consent) table." },
    messages: {
      missingAudit:
        "Mutation of Tier-1 table `{{table}}` with no audit write in this module. Sensitive changes must be audited — call recordAudit(...) (lib/audit/recordAudit.ts). If this mutation legitimately needs none (e.g. a creation-rollback), add `// eslint-disable-next-line pleks/require-audit-on-sensitive-mutation -- <reason>`. See ADDENDUM_AUDIT_HARDENING.",
    },
    schema: [],
  },
  create(context) {
    /** @type {{node: import("estree").Node, table: string}[]} */
    const mutations = []
    let hasAudit = false

    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return
        const method = node.callee.property.name

        // Audit presence: recordAudit(...) OR .from("audit_log").insert(...)
        if (node.callee.object.type === "Identifier" && node.callee.object.name === "recordAudit") {
          // (handled by the Identifier-callee form below; kept for clarity)
        }
        if (method === "insert" && fromTableOfMutation(node) === "audit_log") hasAudit = true

        // A T1 mutation?
        if (MUTATORS.has(method)) {
          const table = fromTableOfMutation(node)
          if (typeof table === "string" && T1_TABLES.has(table)) mutations.push({ node, table })
        }
      },
      // recordAudit(...) / recordAuditReturningId(...) / recordAuditMany(...) as a bare call.
      "CallExpression > Identifier.callee"(node) {
        if (node.name.startsWith("recordAudit")) hasAudit = true
      },
      "Program:exit"() {
        if (hasAudit) return
        for (const m of mutations) {
          context.report({ node: m.node, messageId: "missingAudit", data: { table: m.table } })
        }
      },
    }
  },
}

export default rule
