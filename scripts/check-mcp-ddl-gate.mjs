#!/usr/bin/env node
/**
 * scripts/check-mcp-ddl-gate.mjs — probes for the Supabase MCP DDL gate (M-001).
 *
 * Probes BOTH directions: a mutation must ASK, a read must ALLOW. A gate that asks on
 * everything is as broken as one that asks on nothing — it just fails in the direction
 * people notice, and then gets disabled.
 *
 * The hook's channel is a PreToolUse payload on stdin, so every fixture here is a REAL
 * subprocess invocation with a real payload. Calling the decision logic directly would test
 * a path the harness does not use (LESSONS L-06) — and this hook has no exported function to
 * call anyway, which is deliberate.
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const HOOK = ".claude/hooks/mcp-ddl-gate.js"
const P = "mcp__claude_ai_Supabase__"

if (!existsSync(HOOK)) {
  console.log(`❌ ${HOOK} is missing — the gate this probe exists to verify is not installed`)
  process.exit(1)
}

/** Run the hook exactly as Claude Code would: JSON on stdin, JSON on stdout. */
function decide(payload) {
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" })
  if (r.status !== 0) return { decision: `hook exited ${r.status}`, reason: r.stderr.slice(0, 200) }
  try {
    const o = JSON.parse(r.stdout).hookSpecificOutput
    return { decision: o.permissionDecision, reason: o.permissionDecisionReason }
  } catch {
    return { decision: "unparseable hook output", reason: r.stdout.slice(0, 200) }
  }
}

const call = (tool, input = {}) => JSON.stringify({ tool_name: tool, tool_input: input })

const CASES = [
  // --- must ASK: inherent mutations ---
  ["apply_migration is DDL by definition", call(`${P}apply_migration`, { project_id: "prod", name: "x", query: "CREATE TABLE t(id int)" }), "ask"],
  ["merge_branch — migrations to PRODUCTION, and it carries NO sql to keyword-match", call(`${P}merge_branch`, { branch_id: "br_1" }), "ask"],
  ["reset_branch destroys untracked schema/data", call(`${P}reset_branch`, { branch_id: "br_1" }), "ask"],
  ["delete_branch", call(`${P}delete_branch`, { branch_id: "br_1" }), "ask"],
  ["deploy_edge_function ships code to prod", call(`${P}deploy_edge_function`, { project_id: "prod", name: "f" }), "ask"],

  // --- must ASK: execute_sql, whatever the statement shape ---
  ["execute_sql carrying DDL", call(`${P}execute_sql`, { project_id: "prod", query: "ALTER TABLE leases ADD COLUMN x text" }), "ask"],
  ["execute_sql carrying DML", call(`${P}execute_sql`, { project_id: "prod", query: "UPDATE leases SET x = 1" }), "ask"],
  ["execute_sql that only reads — still ad-hoc SQL on a live project", call(`${P}execute_sql`, { project_id: "prod", query: "SELECT count(*) FROM leases" }), "ask"],

  // --- must ALLOW: reads, and anything not ours ---
  ["list_tables is read-only", call(`${P}list_tables`, { project_id: "prod", schemas: ["public"], verbose: false }), "allow"],
  ["get_advisors is read-only", call(`${P}get_advisors`, { project_id: "prod", type: "security" }), "allow"],
  ["search_docs is read-only", call(`${P}search_docs`, { graphql_query: "{ schema }" }), "allow"],
  ["a non-Supabase tool is none of this hook's business", call("Read", { file_path: "x.ts" }), "allow"],

  // --- must ASK: fail-closed ---
  ["unparseable payload fails to a prompt, not to silence", "{not json", "ask"],
]

let failed = 0
for (const [name, payload, want] of CASES) {
  const { decision } = decide(payload)
  const ok = decision === want
  if (!ok) failed++
  console.log(`  ${ok ? "✓" : "✗"} must ${want.padEnd(5)} — ${name}${ok ? "" : `\n      got: ${decision}`}`)
}

// The statement must reach the human approving it — a gate that asks without showing what it is
// asking about trains people to approve blindly, which is worse than no gate.
const shown = decide(call(`${P}execute_sql`, { project_id: "prod", query: "DROP TABLE leases" }))
const carries = shown.reason.includes("DROP TABLE leases")
console.log(`  ${carries ? "✓" : "✗"} must show  — the statement text appears in the approval prompt`)
if (!carries) failed++

// The namespace itself is a probe: if the real prefix ever changes, every case above still
// "passes" as allow-by-default. Assert the gate fires on the prefix we enumerated.
const nsLive = decide(call(`${P}apply_migration`, { project_id: "p", name: "n", query: "CREATE TABLE t()" })).decision === "ask"
console.log(`  ${nsLive ? "✓" : "✗"} must fire  — the enumerated namespace "${P}" is the one matched`)
if (!nsLive) failed++

console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — asks on mutations, allows reads, shows the statement, fails closed")
process.exit(failed ? 1 : 0)
