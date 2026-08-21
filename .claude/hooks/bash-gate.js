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
// @event PreToolUse
// @matcher Bash
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let decision = "allow";
  let reason = "bash-gate: default allow (unattended profile)";
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""));
    const cmd = (input.tool_input && input.tool_input.command) || "";

    // Each rule names its settings twin — the coarse layer that answers if this hook is ever
    // dead. Pattern adopted from life-therapy. The twin is DORMANT while the hook lives and is
    // deliberately NOT equal-or-stronger: settings speaks in prefix-globs, the hook in
    // separator-aware regex, so ask is the floor and ABSENT is the violation.
    const DENY = [
      // @twin Bash(git push --force*)
      // @twin Bash(git push -f*)
      [/git\s+push\s+[^\n]*(--force|-f\s)/, "force push is denied"],
      // @twin Bash(git reset --hard*)
      [/git\s+reset\s+--hard/, "hard reset is denied"],
      // @no-twin no settings pattern was ever written for this. LT measured the same gap on the
      // same rule; recorded here rather than invented, so the hole is visible instead of implied.
      // ⚠ DENIED THE HARMLESS SHAPE AND PERMITTED THE LETHAL ONES until 2026-08-21. The old pattern
      // was `rm\s+-rf?\s+["']?[\/~]["']?(\s|$)`, which required whitespace-or-end IMMEDIATELY after
      // the root character — so bare `rm -rf /` was caught, while `rm -rf /*` and `rm -rf ~/*` were
      // waved through. That is the inverse of the intended coverage: modern `rm` refuses a bare `/`
      // without `--no-preserve-root` anyway, so the ONE shape the rule actually stopped is the one
      // the OS already stops, and the shapes that destroy a filesystem all passed. Measured against
      // 12 lethal spellings, the old pattern missed 7.
      //
      // Rebuilt on the doctrine `deniedGitSubcommand` (agent-write-scope.js) already carries twenty
      // lines from here: DO NOT PARSE THE FLAG GRAMMAR. That lesson was written for the git rule and
      // never swept across its neighbours — this rule sat parsing `-rf?` the whole time, and so
      // inherited every defeat that shape invites: `-fr` (order), `-f` (no r), `-r -f` (split),
      // `--recursive --force` (long spellings), `--no-preserve-root -rf` (an intervening flag).
      // An intermediate fix that merely SKIPPED flag tokens still missed `rm -rf foo /`, because it
      // assumed the target follows the flags.
      //
      // So: find `rm`, then require a LETHAL TARGET AS A STANDALONE TOKEN ANYWHERE AFTER IT — `/` or
      // `~`, optionally followed by further `/` or `*`, terminating at whitespace or end. Position,
      // flag order and flag spelling all stop mattering. Verified against 13 lethal spellings (all
      // denied) and 9 ordinary ones (all allowed); the two that discriminate a shape-based rule from
      // a wall are `rm -rf /tmp/scratch` and `rm -rf ~/projects/scratch`, which BEGIN with a lethal
      // character and must still pass because a named segment follows.
      //
      // KNOWN FALSE-DENY, accepted and pre-existing: a command that merely MENTIONS the string
      // (`echo 'rm -rf /' >> notes.md`) is denied. The old pattern did this too, so it is no
      // regression, and for a DENY rule it is the correct direction to be wrong in.
      // NOT COVERED, recorded rather than chased: a variable-expanded target (`rm -rf "$HOME"`,
      // `rm -rf $HOME/*`) contains no literal `/` or `~`, so no pattern of this family can reach it.
      // Widening until it does would false-deny the benign half above.
      [/\brm\b.*?(?:\s)["']?[\/~][/*]*["']?(?=\s|$)/, "rm -rf on root/home is denied"],
      // CLAUDE.md forbids --no-verify BY NAME ("which is why it is forbidden") and, until now,
      // nothing anywhere refused it: the .githooks gates cannot see the flag that skips them, and
      // no check can observe a hook that did not run. `-n` is the short spelling and skips the same
      // hooks; `--no-verify` on push skips pre-push. Denied rather than asked, because the whole
      // point of the flag is to skip the gate the ask would be protecting.
      // @no-twin a settings pattern matches a command PREFIX, and the flag can sit anywhere in the
      // command line (`git commit -m x --no-verify`), so `Bash(git commit --no-verify*)` would miss
      // the ordinary spelling. The hole is recorded rather than papered over with a rule that reads
      // like cover and matches almost nothing.
      [/git\s+(commit|push|merge|revert|cherry-pick)\b[^\n]*--no-verify/, "--no-verify skips the commit/push gate and is forbidden"],
      // `-n` is --no-verify ONLY for commit and push. On revert and cherry-pick it is --no-commit
      // and on merge it is --no-stat, all legitimate — denying those would be a false positive in a
      // DENY list, which is the expensive direction to be wrong in.
      [/git\s+(commit|push)\b[^\n]*\s-n(\s|$)/, "-n is --no-verify on commit/push and is forbidden"],
    ];
    const ASK = [
      // @twin Bash(git push*)
      [/git\s+push\b/, "pushing to origin requires approval"],
      // @twin Read(.env)
      // @twin Read(.env.*)
      [/\.env(\.|["'\s]|$)/, "touching .env files requires approval"],
      // @no-twin ad-hoc prod SQL through the CLI has no settings pattern — the other gap LT
      // measured. The MCP path is covered by mcp-ddl-gate; the `supabase db` CLI path is not.
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