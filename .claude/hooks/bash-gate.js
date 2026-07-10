/**
 * .claude/hooks/bash-gate.js — PreToolUse gate for Bash (unattended-autonomy profile)
 *
 * WHY THIS EXISTS: allow-rules cannot cover commands containing $() command substitution or
 * multiline/awk/heredoc bodies — Claude Code's injection analysis decomposes them and prompts
 * regardless of any allow rule, which stalls unattended sessions. A PreToolUse hook decides
 * BEFORE the permission system: "allow" skips the prompt; "ask"/"deny" force the gate.
 *
 * Posture: allow everything EXCEPT the named gates below. deny/ask rules in settings.json
 * still take precedence over a hook "allow", so this is belt-and-braces with the rule list.
 */
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let decision = "allow";
  let reason = "bash-gate: default allow (unattended profile)";
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""));
    const cmd = (input.tool_input && input.tool_input.command) || "";

    const DENY = [
      [/git\s+push\s+[^\n]*(--force|-f\s)/, "force push is denied"],
      [/git\s+reset\s+--hard/, "hard reset is denied"],
      [/rm\s+-rf?\s+["']?[\/~]["']?(\s|$)/, "rm -rf on root/home is denied"],
    ];
    const ASK = [
      [/git\s+push\b/, "pushing to origin requires approval"],
      [/\.env(\.|["'\s]|$)/, "touching .env files requires approval"],
      [/supabase\s+db\s+(push|reset)/, "prod database operations require approval"],
    ];

    for (const [re, why] of DENY) {
      if (re.test(cmd)) { decision = "deny"; reason = "bash-gate: " + why; break; }
    }
    if (decision === "allow") {
      for (const [re, why] of ASK) {
        if (re.test(cmd)) { decision = "ask"; reason = "bash-gate: " + why; break; }
      }
    }
  } catch {
    decision = "ask";
    reason = "bash-gate: could not parse hook input — failing to a prompt, not to silence";
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
});