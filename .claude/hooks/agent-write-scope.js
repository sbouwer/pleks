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
 * to `.handoff/<task-slug>/` and nowhere else. This is that sentence, enforced.
 *
 * ⚠ THAT PATH WAS `.claude/handoff/` UNTIL 2026-08-21, AND MOVING IT IS A PERMISSIONS FIX, not
 * tidying. Claude Code treats a small set of paths as PROTECTED — `.git` and `.claude` among them —
 * and writes to them are documented as never auto-approved in any mode a pipeline would actually
 * use (`bypassPermissions` excepted). The handoff protocol had put every agent artefact inside the
 * one tree the permission system refuses to wave through, so an unattended run stalls on a prompt
 * per artefact, by design, with no hook or settings rule able to change it.
 *
 * The destination is confirmed safe against the DOCUMENTED list, which is enumerated and not merely
 * exemplified: ten protected directories (`.git`, `.config/git`, `.vscode`, `.idea`, `.husky`,
 * `.cargo`, `.devcontainer`, `.yarn`, `.mvn`, `.claude` minus `.claude/worktrees`) plus ~21 named
 * files, and NO dotfile wildcard — so a repo-root `.handoff/` is unaffected. Protection is also
 * documented to run BEFORE `permissions.allow` is evaluated, which is why the two
 * `Write`/`Edit(.claude/handoff/**)` lines were deleted rather than repointed: they could never have
 * worked, they were not merely redundant.
 *
 * ⚠ WHAT IS STILL NOT ESTABLISHED is whether that guard applies to a SUBAGENT's tool calls at all —
 * the docs do not say, and E14's attempt to measure it is WITHDRAWN AS CONFOUNDED. Both arms wrote
 * successfully with no prompt, but approving one `.claude/` write earlier in a session grants
 * "allow Claude to edit its own settings for this session", and this session had written there over
 * a hundred times before the probe ran. The experiment measured a standing grant. The re-run needs a
 * FRESH session with the control arm first; protocol is in E14.
 *
 * ⚠ AND THE THING THAT MAKES THAT HOOK-SHAPED: **subagent tool calls are recorded NOWHERE in the
 * project transcript.** E14 proved it with a positive control — two writes known to have happened,
 * zero `isSidechain` records, zero `tool_use` records naming them, across all 94 records in the
 * window. This hook is therefore not merely the enforcement point for a subagent's writes; it is the
 * ONLY place they are observable at all. An earlier version of this note argued from 125 unprompted
 * `.claude/` writes; every one of those was a MAIN-SESSION write, so it compared the wrong
 * population and is corrected in E13. See E13 and E14.
 *
 * SECOND REMIT, added 2026-08-20 (M-068): a subagent may not CREATE COMMITS. The protocol says an
 * agent "ends at a report; the caller commits" — that was prose with nothing behind it, because
 * this hook matched only the edit tools and never saw `Bash`. Worktree isolation did not enforce it
 * either; it made a subagent's commit land on a throwaway branch instead of yours, which HID the
 * behaviour rather than preventing it — and hid it while making the agent's work invisible to your
 * tree, which is the E10 defect. Dropping isolation (E10 ruling) removed the concealment and left
 * the real gap in view. This closes it at rung 1, where the E10 replacement assumed it already was.
 *
 * Scope of the git denial is deliberately the COMMIT-CREATING family plus `push`, not "git writes":
 * an agent legitimately runs `git log`, `git diff`, `git show`, `git grep`, `git status` — that is
 * most of how a read-only spine works, and denying those would break every pipeline.
 *
 * FAIL-CLOSED DIRECTION: an unparseable payload asks rather than allows — same posture as
 * bash-gate.js. A broken gate that stalls is recoverable; one that waves writes through is not.
 */
// @event PreToolUse
// @matcher Write|Edit|MultiEdit|NotebookEdit|Bash
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
  grounder: [".handoff"],
  census: [".handoff"],
  walker: [".handoff"],
  "db-inspector": [".handoff"],
  "crawler-doctrine": [".handoff", ".claude/crawlers"],
  implementer: null,
};

/**
 * Commit-creating git subcommands, plus `push`. Every one of these either writes a commit object or
 * publishes one; none is recoverable by the caller simply re-running the step.
 *
 * `cherry-pick`, `revert` and `am` are here for the reason CLAUDE.md §3 already gives about them:
 * they create commits while skipping `pre-commit`, so they are the cheapest way for this rule to be
 * defeated by accident rather than intent.
 */
const GIT_COMMIT_FAMILY = "commit|merge|rebase|cherry-pick|revert|am|push";

const GIT_WORD = /\bgit\b/;
const DENIED_SUBCOMMAND = new RegExp(String.raw`(?:^|\s)(${GIT_COMMIT_FAMILY})(?![\w-])`);

/**
 * Returns the denied subcommand in `command`, or null.
 *
 * DELIBERATELY NOT A GIT GRAMMAR PARSER. The first version matched `git <flags>* <subcommand>` and
 * was defeated by `git -C /repo commit` on its first probe run, because `-C` takes a value and the
 * value is not a flag. Chasing that leads to enumerating every global option that takes an argument
 * (`-C -c --git-dir --work-tree --namespace --exec-path --config-env`) and being wrong again on the
 * next one. So: find `git`, then look for a denied subcommand as a standalone token ANYWHERE after
 * it. An unusual invocation cannot slip past a test that does not depend on the invocation's shape.
 *
 * The trailing guard is `(?![\w-])`, NOT `\b` — a hyphen is a word boundary, so `\b` after `merge`
 * matches inside `git merge-base`, which every grounder runs to test ancestry and which writes
 * nothing. Both bugs were caught by the known-good half of the probe suite on the first two runs,
 * which is the entire argument for writing that half.
 *
 * KNOWN FALSE-DENY, accepted: a command that merely mentions both (`rg "git commit" docs/`, or
 * `git log --grep="I am"`) is denied. That is the correct direction to be wrong in — the agent is
 * told exactly what to do instead and can rephrase, whereas a false-allow writes a commit nobody
 * asked for onto the caller's branch, where `--no-verify`-style damage is not the risk so much as
 * a commit the caller never reviewed and now has to find.
 */
function deniedGitSubcommand(command) {
  const g = GIT_WORD.exec(command);
  if (!g) return null;
  const sub = DENIED_SUBCOMMAND.exec(command.slice(g.index + g[0].length));
  return sub ? sub[1] : null;
}

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
    if (agentType && input.tool_name === "Bash") {
      // Bash is gated on WHAT IT RUNS, never on a path — it has none. This branch must come before
      // the path logic below, which would otherwise see a Bash call with no `file_path` and ask on
      // every single command a subagent runs.
      const command = (input.tool_input && input.tool_input.command) || "";
      const hit = deniedGitSubcommand(command);
      if (hit) {
        decision = "deny";
        reason =
          `agent-write-scope: a subagent may not run \`git ${hit}\` — it creates or publishes a ` +
          `commit on the caller's branch. Agents end at a REPORT; the caller commits and pushes. ` +
          `Leave the tree dirty and say what you changed.`;
      } else {
        reason = `agent-write-scope: ${agentType} running a non-committing bash command`;
      }
    } else if (agentType) {
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
              `"${raw}" is outside it. Artefacts go to .handoff/<task-slug>/; ` +
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
