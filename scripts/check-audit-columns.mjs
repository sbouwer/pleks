// scripts/check-audit-columns.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Audit-log column + action validator — ADDENDUM_AUDIT_HARDENING D-5 (column-parity).
//
// Every `.from("audit_log").insert({...})` in the codebase is checked so that:
//   1. its top-level keys are all REAL audit_log columns, and
//   2. any literal `action:` value is in the audit_log.action CHECK set.
//
// This catches the F0 class deterministically at `npm run check`:
//   • erasure.ts wrote user_id / event_type / values (none exist) → silent 42703 → empty trail.
//   • the archive/restore audit used action:"ARCHIVE"/"RESTORE" (not in the CHECK) → silent 23514.
// Both would now FAIL the build instead of failing silently in prod.
//
// SAFETY: warn-don't-fail on what it can't statically resolve — a spread (...x) in the object, or a
// non-literal action (action: someVar, e.g. recordAudit's own pass-through). It only FAILS on a
// confidently-wrong key or action literal.
//
// USAGE: node scripts/check-audit-columns.mjs   # exits 1 on a phantom column / invalid action
// ─────────────────────────────────────────────────────────────────────────────
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { realpathSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

// The real audit_log columns (verified against live DB 2026-06-04). id + created_at are auto.
const AUDIT_COLUMNS = new Set([
  "org_id", "table_name", "record_id", "action", "changed_by",
  "old_values", "new_values", "ip_address", "user_agent", "actor_name",
])

// The audit_log.action CHECK set (verified against live DB 2026-06-04). Keep in sync with the migration.
const ACTION_ENUM = new Set([
  "INSERT", "UPDATE", "DELETE", "NOTE", "SYNC", "OWNERSHIP_TRANSFERRED", "CONFLICT_ACKNOWLEDGED",
])

const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/]

async function main() {
  const { Project, SyntaxKind, Node } = await import("ts-morph")
  const project = new Project({ tsConfigFilePath: resolve(ROOT, "tsconfig.json"), skipAddingFilesFromTsConfig: false })

  const badColumns = []   // { file, line, key }
  const badActions = []   // { file, line, action }
  const dynamic = []      // { file, line, reason }

  /** Is this `.insert(...)` chained onto a `.from("audit_log")`? */
  function targetsAuditLog(insertCall) {
    let node = insertCall.getExpression() // `.insert` PropertyAccess
    while (node) {
      if (Node.isPropertyAccessExpression(node)) {
        node = node.getExpression()
      } else if (Node.isCallExpression(node)) {
        const callee = node.getExpression()
        if (Node.isPropertyAccessExpression(callee) && callee.getName() === "from") {
          const arg = node.getArguments()[0]
          return arg && Node.isStringLiteral(arg) && arg.getLiteralText() === "audit_log"
        }
        node = node.getExpression()
      } else {
        return false
      }
    }
    return false
  }

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath()
    if (EXCLUDE.some((re) => re.test(filePath))) continue
    const rel = relative(ROOT, filePath)

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression()
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "insert") continue
      if (!targetsAuditLog(call)) continue

      const arg = call.getArguments()[0]
      const line = call.getStartLineNumber()
      if (!arg || !Node.isObjectLiteralExpression(arg)) {
        dynamic.push({ file: rel, line, reason: "insert arg is not an object literal" })
        continue
      }

      for (const prop of arg.getProperties()) {
        if (Node.isSpreadAssignment(prop)) {
          dynamic.push({ file: rel, line, reason: "spread in insert object" })
          continue
        }
        if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue
        const name = prop.getName()
        if (!AUDIT_COLUMNS.has(name)) badColumns.push({ file: rel, line, key: name })

        // Validate a literal action value against the CHECK.
        if (name === "action" && Node.isPropertyAssignment(prop)) {
          const init = prop.getInitializer()
          if (init && Node.isStringLiteral(init)) {
            const val = init.getLiteralText()
            if (!ACTION_ENUM.has(val)) badActions.push({ file: rel, line, action: val })
          } else {
            dynamic.push({ file: rel, line, reason: "non-literal action value" })
          }
        }
      }
    }
  }

  console.log("\n🔎  Audit-log column + action validator")
  console.log("──────────────────────────────────────────────────")
  if (dynamic.length) console.log(`  ⚠ ${dynamic.length} audit insert(s) not fully statically validated (spread / dynamic action)`)

  if (badColumns.length === 0 && badActions.length === 0) {
    console.log("  ✓ all audit_log inserts write real columns + valid actions")
    console.log("──────────────────────────────────────────────────")
    return
  }

  if (badColumns.length) {
    console.log(`\n  ✗ ${badColumns.length} audit insert(s) write a NON-EXISTENT column:`)
    for (const f of badColumns) console.log(`     ${f.file}:${f.line} — "${f.key}" is not a real audit_log column`)
  }
  if (badActions.length) {
    console.log(`\n  ✗ ${badActions.length} audit insert(s) use an action NOT in the CHECK:`)
    for (const f of badActions) console.log(`     ${f.file}:${f.line} — action "${f.action}" — allowed: ${[...ACTION_ENUM].join(", ")}`)
  }
  console.log("──────────────────────────────────────────────────")
  console.log("  Use lib/audit/recordAudit.ts (real columns + INSERT/UPDATE/DELETE; semantic in new_values.action).")
  console.log("  A new action string needs the audit_log CHECK widened (migration) AND adding to ACTION_ENUM here.")
  process.exit(1)
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : ""
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
