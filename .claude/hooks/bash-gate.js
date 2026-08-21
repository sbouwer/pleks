/**
 * .claude/hooks/bash-gate.js — PreToolUse gate for Bash (unattended-autonomy profile)
 *
 * WHY THIS EXISTS: allow-rules cannot cover commands containing $() command substitution or
 * multiline/awk/heredoc bodies — Claude Code's injection analysis decomposes them and prompts
 * regardless of any allow rule, which stalls unattended sessions. A PreToolUse hook decides
 * BEFORE the permission system: "allow" skips the prompt; "ask"/"deny" force the gate.
 *
 * Posture: allow everything EXCEPT the named gates below.
 *
 * ⚠ THIS HEADER USED TO SAY the settings rule list was "belt-and-braces" with these patterns,
 * because deny/ask rules in settings.json "still take precedence over a hook allow". Corrected
 * 2026-08-21: the layers are SERIAL, not redundant — the hook answers first, and its twin in
 * settings.json is DORMANT while the hook lives. "Belt-and-braces" describes two controls both
 * firing; that is not what happens, and reading it that way is how a gap in one layer looks
 * covered by the other. Worse, the precedence claim it rested on is itself the open question:
 * whether a hook's `allow` GRANTS anything or merely declines to deny is recorded as UNRESOLVED in
 * docs/EXPERIMENTS.md (E12). This header asserted as settled the thing the register calls open.
 * The twins are a fallback for when the hook is dead, and each is tagged `@twin` at its rule.
 */
// @event PreToolUse
// @matcher Bash

/**
 * Is this an `rm` aimed at a filesystem root or a bare home directory?
 *
 * NOT A REGEX, on purpose, and the reason is measured rather than stylistic. The regex this
 * replaced — `\brm\b.*?(?:\s)["']?[\/~][/*]*["']?(?=\s|$)` — was QUADRATIC: the lazy `.*?` rescans
 * the whole tail from every `rm` token in the string, so cost grows with (rm-count × length).
 * Doubling the input quadrupled the time (measured 4.02×), and this gate runs in front of EVERY
 * Bash call:
 *      10KB command   6.6ms      (the linear predecessor: 0.003ms)
 *      60KB commit    61ms       — this repo writes register entries that long
 *      100KB          679ms
 *      500KB          17,057ms
 * This function is one pass over the tokens: 500KB in ~27ms, and flat per character.
 *
 * That is the ReDoS lesson, learnt for the FOURTH time in this repo — the email check, the money
 * formatter, and `supabase/reconcile/apply-prod.mjs:40`, which says in a comment "a gate is not the
 * place for it" and chose a plain line scan for exactly this reason. It had never been promoted to
 * the cross-repo ledger, so it was available to be re-learnt. It is filed now.
 *
 * The matching doctrine is `deniedGitSubcommand`'s, twenty lines from here: DO NOT PARSE THE FLAG
 * GRAMMAR. Find the command, then look for a lethal target as a STANDALONE TOKEN anywhere after it.
 * Flag order, flag spelling, and the target's position all stop mattering, which is what defeated
 * every earlier attempt: `-fr`, `-f`, `-r -f`, `--recursive --force`, `--no-preserve-root -rf`, and
 * `rm -rf foo /` (target not adjacent to the flags).
 *
 * Normalisations, each closing shapes an earlier cut let through — every one found by adversarial
 * review rather than by the author, which is the reason this rule now has a probe per shape:
 *   · SEGMENT PER COMMAND on `;`, `&`, `|` and newline, matching `rm` within a segment. A
 *     whitespace-only split yields the single token `/*;echo` for `rm -rf /*;echo done` and the
 *     target hides inside it — `(?=\s|$)` is a CHARACTER test, not a token boundary, the same defect
 *     class as the pattern it replaced.
 *   · JOIN BACKSLASH-NEWLINE FIRST, before segmenting, or the newline separator tears a continued
 *     command in half at exactly the point an attacker would choose it.
 *   · STRIP QUOTES, GROUPING AND A LEADING BACKSLASH. `/"*"` and `'/'*` are both `/*` to the shell;
 *     `(rm -rf /*)` hides the command in a paren; `\rm` is the standard alias-bypass idiom and
 *     without the strip the rule silently stands down. Quotes come out ANYWHERE in the token,
 *     because mid-token is precisely where they were used to hide.
 *
 * KNOWN FALSE-DENY, accepted: a command that merely MENTIONS the string
 * (`echo 'rm -rf /' >> notes.md`) is denied. For a DENY rule that is the correct direction to be
 * wrong in — a false deny costs a rephrase, a false allow costs the filesystem.
 *
 * An earlier cut ALSO false-denied `rm -rf .next && du -sh /`, and recorded it as accepted. It was
 * not accepted, merely unsegmented: `seenRm` was set once and carried to the end of the string. Per-
 * segment reset removes it for free while keeping every deny case, and the lesson is worth more than
 * the fix — a cost written down as "accepted" stops being re-examined, so an unnecessary one can sit
 * in a comment indefinitely looking like a considered trade.
 *
 * NOT COVERED, recorded rather than chased: a variable-expanded target (`rm -rf "$HOME"`) contains
 * no literal `/` or `~`, so nothing reading the command TEXT can see the value; and `cd / && rm -rf *`
 * hides the danger in the preceding `cd`, the target being a bare `*` that is correctly allowed.
 */
/**
 * Strip the shell punctuation that carries no meaning for these rules, so one token compares as one
 * word. `/"*"` and `'/'*` are both `/*` to the shell; `(rm` hides a command inside a subshell paren;
 * `\rm` is the standard alias-bypass idiom. Quotes come out ANYWHERE, because mid-token is exactly
 * where they were used to hide.
 *
 * A CHARACTER LOOP, NOT A REGEX, and that is not fussiness: `/^[\\({[]+|[)}\]]+$/` is super-linear
 * (an anchored greedy class backtracks across a run of the same character) and `sonarjs/
 * super-linear-regex` flags it. This file is the wrong place to argue that the input is short.
 */
function normToken(t) {
  const s = t.replace(/["'`]/g, "");
  let i = 0, j = s.length;
  while (i < j && "\\({[".includes(s[i])) i++;
  while (j > i && ")}]".includes(s[j - 1])) j--;
  return s.slice(i, j);
}

/**
 * A command string as SEGMENTS of normalised tokens — one segment per shell command.
 *
 * Shared by every rule below that needs to know where a command starts, which is the consolidation
 * this file kept re-deriving: three rules had each grown their own idea of a token boundary out of
 * `\s`, `\b` and lookaheads, and every one of them was defeated by punctuation touching the target.
 *
 * Continuations are joined BEFORE segmenting, or the newline separator tears a continued command in
 * half at exactly the point an attacker would choose it.
 */
function segments(command) {
  return command
    .replace(/\\\r?\n/g, " ")
    .split(/[;&|\n]+/)
    .map((seg) => seg.split(/\s+/).map(normToken).filter(Boolean));
}

/** Does this segment run `name` (as `name`, `/usr/bin/name` or `\name`)? Returns the token index. */
function commandIndex(tokens, name) {
  const re = new RegExp(`^(?:[^\\s]*/)?${name}$`);
  return tokens.findIndex((t) => re.test(t));
}

/**
 * Is this an `rm` aimed at a filesystem root or a bare home directory?
 *
 * NOT A REGEX, on purpose, and the reason is measured rather than stylistic. The regex this
 * replaced — a lazy expansion after the command token — was QUADRATIC: it rescans the whole tail
 * from every `rm` token, so cost grows with (occurrences × length). Doubling the input quadrupled
 * the time (measured 4.02×), and this gate runs in front of EVERY Bash call:
 *      10KB command   6.6ms      (the linear predecessor: 0.003ms)
 *      60KB commit    61ms       — this repo writes register entries that long
 *      100KB          679ms
 *      500KB          17,057ms
 * Token matching is one pass: 500KB in ~27ms, flat per character.
 *
 * That is the ReDoS lesson for the FOURTH time in this repo — the email check, the money formatter,
 * and `supabase/reconcile/apply-prod.mjs:40`, which says in a comment "a gate is not the place for
 * it" and chose a plain line scan for exactly this reason. The repo also had `sonarjs/
 * super-linear-regex` configured the whole time and `.claude/**` was in `globalIgnores`, so the one
 * mechanism that catches this class was pointed away from the file that most needed it.
 *
 * The matching doctrine is `deniedGitSubcommand`'s: DO NOT PARSE THE FLAG GRAMMAR. Find the command,
 * then look for a lethal target as a STANDALONE TOKEN anywhere after it in the same segment. Flag
 * order, flag spelling and target position all stop mattering, which is what defeated every earlier
 * attempt: `-fr`, `-f`, `-r -f`, `--recursive --force`, `--no-preserve-root -rf`, and a target that
 * does not follow the flags at all.
 *
 * KNOWN FALSE-DENY, accepted: a command that merely MENTIONS the string is denied — this commit's
 * own message had to be written to a file because of it. For a DENY rule that is the correct
 * direction to be wrong in: a false deny costs a rephrase, a false allow costs the filesystem.
 *
 * An earlier cut ALSO false-denied a delete followed by an unrelated command reading a root path,
 * and recorded it as accepted. It was not accepted, merely unsegmented — the seen-flag was set once
 * and carried to the end of the string. Per-segment reset removes it for free, and the lesson is
 * worth more than the fix: a cost written down as "accepted" stops being re-examined, so an
 * unnecessary one can sit in a comment indefinitely looking like a considered trade.
 *
 * NOT COVERED, recorded rather than chased: a variable-expanded target contains no literal `/` or
 * `~`, so nothing reading the command TEXT can see the value; and a `cd` to root followed by a
 * delete of `*` hides the danger in the `cd`, the target being a bare `*` that is correctly allowed.
 */
function isDestructiveRm(command) {
  // `/` or `~`, then only more slashes and stars. `/tmp/scratch` and `~/projects` fail because a
  // NAMED segment follows — the two cases that separate a gate from a wall.
  const LETHAL_TARGET = /^[/~][/*]*$/;
  for (const tokens of segments(command)) {
    const at = commandIndex(tokens, "rm");
    if (at === -1) continue;
    if (tokens.slice(at + 1).some((t) => LETHAL_TARGET.test(t))) return true;
  }
  return false;
}

/**
 * Is this a force push? Same doctrine, and it was carrying the same defect.
 *
 * The regex here was `git\s+push\s+[^\n]*(--force|-f\s)` — an unbounded class followed by an
 * alternation, which `sonarjs/super-linear-regex` flags for the same backtracking reason as the
 * `rm` rule's. It also inherited the same blind spot: `-f` required a trailing SPACE, so
 * `git push -f` at the end of a line matched only via the `[^\n]*` swallowing nothing, and any
 * punctuation-adjacent spelling was a coin flip. Tokens remove the question.
 */
function isForcePush(command) {
  const FORCE = /^(?:-f|--force(?:-with-lease)?(?:=.*)?)$/;
  for (const tokens of segments(command)) {
    const git = commandIndex(tokens, "git");
    if (git === -1) continue;
    // `git -C dir push --force` — the subcommand is not always adjacent, which is the same
    // "target follows the flags" assumption that defeated the rm rule.
    if (!tokens.slice(git + 1).includes("push")) continue;
    if (tokens.slice(git + 1).some((t) => FORCE.test(t))) return true;
  }
  return false;
}

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
      [isForcePush, "force push is denied"],
      // @twin Bash(git reset --hard*)
      [/git\s+reset\s+--hard/, "hard reset is denied"],
      // @no-twin no settings pattern was ever written for this. LT measured the same gap on the
      // same rule; recorded here rather than invented, so the hole is visible instead of implied.
      // ⚠ DENIED THE HARMLESS SHAPE AND PERMITTED THE LETHAL ONES until 2026-08-21. The original was
      // `rm\s+-rf?\s+["']?[\/~]["']?(\s|$)`, requiring whitespace-or-end IMMEDIATELY after the root
      // character — so bare `rm -rf /` was caught, while `rm -rf /*` and `rm -rf ~/*` were waved
      // through. The inverse of the intended coverage: modern `rm` refuses a bare `/` without
      // `--no-preserve-root` anyway, so the ONE shape the rule stopped is the one the OS already
      // stops. Its regex replacement closed those and opened two new holes of its own (six more
      // bypasses, and a quadratic blowup) before adversarial review caught both.
      // Rationale, doctrine, measurements and the accepted false-denies: see `isDestructiveRm`.
      [isDestructiveRm, "rm -rf on root/home is denied"],
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
      // ANCHORED ON A PATH BOUNDARY, not on the surrounding characters. The old pattern was
      // `\.env(\.|["'\s]|$)`, which matched `.env` followed by a dot ANYWHERE — so
      // `node -e "console.log(process.env.NODE_ENV)"` asked, and so did `import.meta.env` and
      // `rg "\.env" docs/`. In a hook whose stated posture is unattended autonomy, the residual
      // friction landed on shapes agents use constantly.
      //
      // Same defect class as the rm rule twenty lines up and as the git rule before it: the pattern
      // matched characters AROUND the thing instead of the thing. Third instance in this one file,
      // which is the actual finding — a lesson landing on one rule does not propagate to its
      // neighbours, and the sweep has to be the whole file, not the rule that prompted it.
      //
      // `.env` must now START a path token: at the beginning, or after whitespace, a quote, an `=`,
      // or a `/`. An identifier character before it (`process`, `meta`) means it is a property
      // access, not a file.
      // ⚠ THE LEADING ANCHOR SET NARROWED THIS RULE, and the first cut of it dropped four separators
      // that carry real reads. Found by adversarial review: `cat C:\dev\pleks\.env`, `type .\.env`,
      // `cat <.env`, `echo X >.env` and `cat *.env` ALL asked under the old unanchored pattern and
      // were silently allowed by the anchored one. On Windows — this repo's platform — the omission
      // of `\` alone un-gated every absolute path to a secrets file.
      //
      // The anchor is still the right discriminator, and the trailing side cannot do this job: the
      // false positive being fixed was `process.env.NODE_ENV`, which is `.env` followed by `.`, and
      // so is `.env.local`. What separates them is what comes BEFORE — an identifier character
      // (`process`, `meta`) means a property access; a separator means a path.
      //
      // ACCEPTED COST, chosen rather than discovered: adding `\` makes `rg "\.env"` ask, because the
      // regex-escape backslash is indistinguishable from a path separator without knowing the
      // command's quoting. That probe was flipped from allow to ask deliberately. An extra prompt on
      // a grep is cheap; a silent read of a secrets file is the thing this rule exists to stop.
      [/(?:^|[\s"'=/\\<>*])\.env(\.|["'\s]|$)/, "touching .env files requires approval"],
      // @no-twin ad-hoc prod SQL through the CLI has no settings pattern — the other gap LT
      // measured. The MCP path is covered by mcp-ddl-gate; the `supabase db` CLI path is not.
      [/supabase\s+db\s+(push|reset)/, "prod database operations require approval"],
    ];

    // A rule is a RegExp or a predicate. The `rm` rule is a function because the regex form of it
    // was quadratic in a gate that runs before every Bash call — see `isDestructiveRm`.
    const hits = (rule, s) => (typeof rule === "function" ? rule(s) : rule.test(s));

    for (const [rule, why] of DENY) {
      if (hits(rule, cmd)) { decision = "deny"; reason = "bash-gate: " + why; break; }
    }
    if (decision === "allow") {
      for (const [rule, why] of ASK) {
        if (hits(rule, cmd)) { decision = "ask"; reason = "bash-gate: " + why; break; }
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