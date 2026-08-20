/**
 * .claude/hooks/agent-write-scope.js — PreToolUse gate bounding where a SUBAGENT may write.
 *
 * WHY THIS EXISTS: E8 (docs/EXPERIMENTS.md) measured that `tools:` frontmatter does NOT withhold
 * Write/Edit from a custom spine on CLI 2.1.235 — the harness appends both to every custom agent
 * regardless. Four spines describe themselves as read-only in prose and are not read-only in fact.
 * E7 measured the replacement: PreToolUse stdin carries `agent_id` and `agent_type` on a subagent
 * invocation and carries neither in the main session, so the scope can be decided per agent type
 * at the tool call rather than asserted in a spine and hoped for.
 *
 * The pipeline protocol (dev-standards/playbooks/4-AGENT-PIPELINES.md §8) says agent artefacts go
 * to `.claude/handoff/<task-slug>/` and nowhere else. This is that sentence, enforced.
 *
 * FAIL-CLOSED DIRECTION: an unparseable payload asks rather than allows — same posture as
 * bash-gate.js. A broken gate that stalls is recoverable; one that waves writes through is not.
 */
// @event PreToolUse
// @matcher Write|Edit|MultiEdit|NotebookEdit
// @no-twin settings.json permissions have no agent dimension — a `Write(...)` rule cannot say
// "only when the caller is a subagent", so any twin would either be dormant-and-useless or would
// gate the main session's every edit. The probe suite in scripts/check-agent-write-scope.mjs is the
// backstop instead: if this hook is deleted or stops matching, `npm run check` goes red.
const path = require("node:path");

/**
 * Write scope per agent type. An entry of `null` means unrestricted.
 *
 * The four read-only spines get the handoff directory and nothing else — that is their entire
 * legitimate write surface under the pipeline protocol. crawler-doctrine additionally owns its
 * findings file; implementer's whole remit IS editing source, and its containment is the worktree
 * it is spawned into, not a path list.
 *
 * An agent type absent from this table is NOT denied — it is asked. Ad-hoc `general-purpose`
 * delegation is a legitimate thing to do and this hook is not the place to forbid it; but a write
 * from an agent nobody scoped should be visible rather than silent.
 */
const SCOPES = {
  grounder: [".claude/handoff"],
  census: [".claude/handoff"],
  walker: [".claude/handoff"],
  "db-inspector": [".claude/handoff"],
  "crawler-doctrine": [".claude/handoff", ".claude/crawlers"],
  implementer: null,
};

/** Resolve a tool's target path, whatever the tool calls the field. */
function targetPath(toolInput) {
  if (!toolInput) return null;
  return toolInput.file_path || toolInput.notebook_path || toolInput.path || null;
}

/** True when `file` sits inside `root`. Case-insensitive on Windows; `..` cannot escape. */
function contains(root, file) {
  const rel = path.relative(root, file);
  if (rel === "") return true;
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return true;
}

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let decision = "allow";
  let reason = "agent-write-scope: not a subagent write";
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""));
    const agentType = input.agent_type;

    // No `agent_type` means the main session. E7 confirmed the field is absent there, and confirmed
    // it in BOTH directions (a control ran before and after the treatment) — so absence is a real
    // signal, not a field this hook simply never sees.
    if (agentType) {
      const cwd = input.cwd || process.cwd();
      const raw = targetPath(input.tool_input);
      if (!raw) {
        decision = "ask";
        reason = `agent-write-scope: ${agentType} called ${input.tool_name} with no recognisable path field`;
      } else if (!(agentType in SCOPES)) {
        decision = "ask";
        reason = `agent-write-scope: "${agentType}" has no declared write scope — approve deliberately or add one`;
      } else {
        const allowed = SCOPES[agentType];
        if (allowed !== null) {
          const file = path.resolve(cwd, raw);
          const roots = allowed.map((r) => path.resolve(cwd, r));
          if (!roots.some((root) => contains(root, file))) {
            decision = "deny";
            reason =
              `agent-write-scope: ${agentType} may only write to ${allowed.join(", ")} — ` +
              `"${raw}" is outside it. Artefacts go to .claude/handoff/<task-slug>/; ` +
              `report findings to the caller instead of editing the tree.`;
          } else {
            reason = `agent-write-scope: ${agentType} writing inside its scope`;
          }
        } else {
          reason = `agent-write-scope: ${agentType} has an unrestricted write grant`;
        }
      }
    }
  } catch {
    decision = "ask";
    reason = "agent-write-scope: could not parse hook input — failing to a prompt, not to silence";
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
});
