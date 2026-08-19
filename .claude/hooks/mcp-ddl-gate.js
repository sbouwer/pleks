/**
 * .claude/hooks/mcp-ddl-gate.js — PreToolUse gate for the Supabase MCP (M-001)
 *
 * WHY THIS EXISTS: `bash-gate.js` inspects the Bash tool only, so it cannot see schema changes
 * that arrive through the MCP. `permissions.ask` in settings.json is the coarse twin and does
 * cover some of them — but a settings rule can only match a TOOL NAME. It cannot read the SQL,
 * so it cannot tell `SELECT 1` from `DROP TABLE leases`, and it cannot put the statement in
 * front of the human approving it. That is this hook's job.
 *
 * DESIGN NOTE — why this is NOT "DDL keyword AND tool", the obvious formulation:
 * the tool list was ENUMERATED before this matcher was written (slice 0), and the enumeration
 * killed the AND. `merge_branch` merges migrations INTO PRODUCTION and its only argument is a
 * `branch_id` — there is no SQL text to match a keyword against, so an AND-gate would never fire
 * on the highest-blast tool in the set. `apply_migration` is DDL by definition ("Use this when
 * executing DDL operations"), so a keyword requirement there adds a way to miss and buys nothing.
 * The keyword is therefore a LABELLING device for `execute_sql` — the one tool where DDL is
 * possible but not certain — never a precondition for asking.
 *
 * NAMESPACE: `mcp__claude_ai_Supabase__*` — `claude_ai_` infix, capital S. The natural guess
 * `mcp__supabase__*` DOES NOT EXIST in this session (probed, both directions). A matcher written
 * against it would match nothing forever, and a gate that matches nothing is indistinguishable
 * from a gate that is working (LESSONS L-01). Prefix-matched below rather than hard-coded to the
 * full list, so a renamed/added tool fails toward asking rather than toward silence.
 *
 * A hook "allow" does NOT override a settings "ask"/"deny" — the layers are serial, and settings
 * wins. So this hook can only ever ADD friction, never remove it.
 */
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let decision = "allow";
  let reason = "mcp-ddl-gate: not a Supabase MCP mutation";

  // Inherent destructiveness — no argument inspection can make these safe, so they never
  // depend on one. merge/reset/rebase/delete_branch were MISSING from settings.ask entirely.
  // @twin mcp__claude_ai_Supabase__apply_migration
  // @twin mcp__claude_ai_Supabase__merge_branch
  // @twin mcp__claude_ai_Supabase__reset_branch
  // @twin mcp__claude_ai_Supabase__rebase_branch
  // @twin mcp__claude_ai_Supabase__delete_branch
  // @twin mcp__claude_ai_Supabase__create_branch
  // @twin mcp__claude_ai_Supabase__create_project
  // @twin mcp__claude_ai_Supabase__deploy_edge_function
  // @twin mcp__claude_ai_Supabase__pause_project
  // @twin mcp__claude_ai_Supabase__restore_project
  // @twin mcp__claude_ai_Supabase__execute_sql
  //
  // Every tool this hook asks on also sits in settings' `ask` list, so the coarse layer answers
  // if this hook is dead. What it CANNOT answer is the part that made this gate worth writing:
  // settings matches a tool NAME, so it cannot tell `SELECT 1` from `DROP TABLE leases`, and it
  // cannot put the statement in front of the human approving it. The twin degrades to "ask on
  // every execute_sql", which is the floor, not the equivalent.
  const ALWAYS_ASK = {
    apply_migration: "applies DDL to the database",
    merge_branch: "MERGES MIGRATIONS TO PRODUCTION",
    reset_branch: "resets a branch — untracked data and schema changes are LOST",
    rebase_branch: "replays production migrations onto a branch",
    delete_branch: "deletes a development branch",
    pause_project: "pauses the project",
    restore_project: "restores the project",
    deploy_edge_function: "deploys code to production",
    create_project: "creates a billable project",
    create_branch: "creates a billable branch",
  };

  // Statement-level DDL/DML markers, used to LABEL an execute_sql prompt, never to gate it.
  const DDL = /\b(create|alter|drop|truncate|grant|revoke|comment\s+on)\b/i;
  const DML = /\b(insert|update|delete|upsert)\b/i;

  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""));
    const tool = input.tool_name || "";
    const args = input.tool_input || {};

    const PREFIX = "mcp__claude_ai_Supabase__";
    if (tool.startsWith(PREFIX)) {
      const bare = tool.slice(PREFIX.length);
      const project = args.project_id || args.branch_id || "(no project/branch id in args)";

      if (ALWAYS_ASK[bare]) {
        decision = "ask";
        reason = `mcp-ddl-gate: ${bare} — ${ALWAYS_ASK[bare]}. Target: ${project}`;
        if (args.query) reason += `\n--- statement ---\n${String(args.query).slice(0, 1200)}`;
      } else if (bare === "execute_sql") {
        const q = String(args.query || "");
        const kind = DDL.test(q) ? "DDL" : DML.test(q) ? "DML (writes rows)" : "read-shaped";
        decision = "ask";
        reason =
          `mcp-ddl-gate: execute_sql on ${project} — statement looks ${kind}. ` +
          `Ad-hoc SQL belongs in a migration file; approve only if this is genuinely a read ` +
          `or a one-off you intend not to reproduce.\n--- statement ---\n${q.slice(0, 1200)}`;
      }
      // Everything else under the prefix (list_*, get_*, search_docs, …) is read-only: allow.
    }
  } catch {
    // Same posture as bash-gate: an unparseable payload must not become a silent allow.
    decision = "ask";
    reason = "mcp-ddl-gate: could not parse hook input — failing to a prompt, not to silence";
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
});
