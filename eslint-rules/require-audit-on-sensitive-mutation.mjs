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
 *   • `applications`, `properties`, `tenants` — M-004 proposed all three plus user_orgs. MEASURED
 *     2026-08-19 before adding: 40 findings across 27 files, and classifying every one showed the
 *     same shape as user_orgs above. `applications` is dominated by applicant draft autosave,
 *     consent and document-upload touches (21 of the 40); `properties` includes a UI widget
 *     dismissal; `tenants` includes getTenantSession's last-seen write. Auditing the SENSITIVE
 *     subset of those — a screening decision, a submission, a fee — needs finer-than-table-level
 *     detection, exactly as user_orgs does. Adding them at table level would have produced a rule
 *     whose findings are mostly noise, and a noisy rule earns an allowlist and then stops being
 *     read. `leases` was added because its mutations are all tenancy-state changes.
 *     The register entry (M-004) proposed the wider set; the measurement refused it.
 *
 * A legitimate exception (e.g. a creation-rollback that deletes a just-written row) uses an explicit
 * `// eslint-disable-next-line pleks/require-audit-on-sensitive-mutation -- <reason>` on the mutation.
 *
 * ── CORRECTION to commit 4e666ff4, which is pushed and therefore fixed forward here ────────────
 * That message ended "Note what LEFT the list: contactBankAccounts, which the old rule passed for
 * the wrong reason and the new one passes for the right one." Nothing left the list.
 * `lib/contacts/contactBankAccounts.ts` was never in the baseline — not before that commit
 * (4 entries: the cron, the docuseal webhook, notices, revertSigning) and not after (8). The half
 * that is true is the half about REASONS: it passed the module-scoped rule because one audit
 * anywhere exempted the whole file, and it passes the function-scoped rule because the local
 * `bankAudit` wrapper is now followed one hop. Both pass; neither is a baseline entry.
 *
 * Worth keeping as more than a correction. The claim was plausible, flattering, and checkable in
 * one `git show` — the exact profile CLAUDE.md's "citations must be verified, not plausible" names,
 * applied to a commit message rather than a spec. A commit message is an artefact future readers
 * trust precisely because it is immutable, which makes an unverified claim in one more durable than
 * the same claim in a doc that can be edited.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

/** Known-unaudited production sites, read and classified. Only shrinks. */
const BASELINE = new Set(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "require-audit-on-sensitive-mutation.baseline.json"), "utf8")),
)

// Test files seed and tear down rows as FIXTURES; they are not production mutations and have no
// who/when to record. Scoped out rather than baselined — a baseline entry means "real debt", and
// calling a test fixture debt would make the baseline lie about its own size.
const TEST_PATH = /(^|[/\\])test[/\\]|\.(test|dbtest|spec)\.[cm]?[jt]sx?$/

const T1_TABLES = new Set([
  "contact_bank_accounts", // payout banking — mutable config, the original F1 fraud vector
  "tenant_bank_accounts",  // parallel tenant banking table (D-5) — same fraud surface, same rule
  "leases",                // the tenancy object itself (M-004) — see the note below on what was NOT added
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
    /** @type {{node: import("estree").Node, table: string, fns: Set<object>}[]} */
    const mutations = []
    /** Functions that contain an audit write. A mutation passes if ANY of its enclosing
     *  functions audits — nearest or an ancestor, so a nested callback inside an auditing
     *  function still counts. */
    const auditingFns = new Set()
    let moduleLevelAudit = false
    /** name -> function node, for locally-declared functions. */
    const fnByName = new Map()
    /** function node -> Set of local names it calls. */
    const callsByFn = new Map()

    /** Every enclosing function of a node, innermost first. */
    const enclosingFns = (node) => {
      const out = new Set()
      let n = node.parent
      while (n) {
        if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") out.add(n)
        n = n.parent
      }
      return out
    }
    const markAudit = (node) => {
      const fns = enclosingFns(node)
      if (fns.size === 0) moduleLevelAudit = true
      for (const f of fns) auditingFns.add(f)
    }

    const noteName = (name, fn) => { if (name && fn) fnByName.set(name, fn) }

    return {
      FunctionDeclaration(node) { noteName(node.id?.name, node) },
      VariableDeclarator(node) {
        if (node.init && (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
          noteName(node.id?.name, node.init)
        }
      },
      CallExpression(node) {
        // Any call to a bare local name, recorded against every enclosing function.
        if (node.callee.type === "Identifier") {
          for (const f of enclosingFns(node)) {
            if (!callsByFn.has(f)) callsByFn.set(f, new Set())
            callsByFn.get(f).add(node.callee.name)
          }
        }
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return
        const method = node.callee.property.name

        // Audit presence: recordAudit(...) OR .from("audit_log").insert(...)
        if (node.callee.object.type === "Identifier" && node.callee.object.name === "recordAudit") {
          // (handled by the Identifier-callee form below; kept for clarity)
        }
        if (method === "insert" && fromTableOfMutation(node) === "audit_log") markAudit(node)

        // A T1 mutation?
        if (MUTATORS.has(method)) {
          const table = fromTableOfMutation(node)
          if (typeof table === "string" && T1_TABLES.has(table)) mutations.push({ node, table, fns: enclosingFns(node) })
        }
      },
      // recordAudit(...) / recordAuditReturningId(...) / recordAuditMany(...) as a bare call.
      "CallExpression > Identifier.callee"(node) {
        if (node.name.startsWith("recordAudit")) markAudit(node)
      },
      "Program:exit"() {
        if (moduleLevelAudit) return

        // A function also audits if it CALLS a local function that audits. Without this the rule
        // false-positived on lib/contacts/contactBankAccounts.ts — the payout-banking file this
        // rule was originally written for — because its three mutators audit through a local
        // `bankAudit` wrapper. Module scope was too loose (one audit exempted the whole file);
        // bare function scope is too tight (it cannot see one hop). Propagated to a fixpoint so a
        // chain of helpers resolves, not just the first link.
        let grew = true
        while (grew) {
          grew = false
          for (const [fn, names] of callsByFn) {
            if (auditingFns.has(fn)) continue
            for (const n of names) {
              const target = fnByName.get(n)
              if (target && auditingFns.has(target)) { auditingFns.add(fn); grew = true; break }
            }
          }
        }
        // relPath derivation is a known silent-disable trap (.claude/rules/lint-rules.md): derived
        // the same way as require-org-scope-on-service-write, and probed in both directions.
        const rel = relative(process.cwd(), context.filename).replaceAll("\\", "/")
        if (TEST_PATH.test(rel)) return
        if (BASELINE.has(rel)) return
        for (const m of mutations) {
          // FUNCTION-scoped, not module-scoped. A single recordAudit anywhere in the file used to
          // exempt every T1 mutation in it, so app/api/cron/lease-expiry-check/route.ts could set a
          // lease to "expired" with no audit and pass because two OTHER functions audited.
          if ([...m.fns].some((f) => auditingFns.has(f))) continue
          context.report({ node: m.node, messageId: "missingAudit", data: { table: m.table } })
        }
      },
    }
  },
}

export default rule
