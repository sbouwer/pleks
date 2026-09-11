/**
 * bash-gate.js — PreToolUse gate for Bash. KIT FILE, install at `.claude/hooks/`.
 *
 * @kit bash-gate v6 — tracked OUTSIDE its `KIT:CONFIG` regions. Those regions are yours;
 * everything else is canon's, and `check-kit-drift.mjs` reconciles it.
 *
 * WHY THIS EXISTS, and it is not the reason you would guess. Allow-rules in
 * settings.json cannot cover commands containing `$()` substitution, heredocs,
 * or multiline awk/node bodies — Claude Code's injection analysis decomposes
 * them and prompts regardless of any allow rule, which stalls an unattended
 * session on `ls`. A PreToolUse hook answers BEFORE the permission system, so
 * `allow` skips the prompt. It exists for session friction first and danger
 * second, which is why `0-GREENFIELD.md` phase 0.4 installs it on day ZERO,
 * before there is any code to protect.
 *
 * POSTURE: ALLOW EVERYTHING EXCEPT the named gates. The ALLOW cases matter more
 * than the DENY cases — a gate that over-matches has failed at its job while
 * looking maximally safe. Every rule below is a TOKEN test at COMMAND POSITION
 * inside one shell SEGMENT, never a substring test on the whole string, because
 * every false-deny this file's ancestors recorded came from one of three shapes:
 * a pattern spanning `&&`/`;`/`|` into a neighbouring command, a verb matched
 * inside prose or a quoted argument, or punctuation touching the target
 * (`\rm`, `(rm`, `/"*"`). Segments, normalised tokens and a position check
 * remove all three at once. ONE rule also reads the segments BEFORE its own, and only to learn
 * which branch its segment lands on: the protected-branch ask (v5, below).
 *
 * v2 (2026-09-08) is the harvest of four field copies. Measured before it:
 * canon ALLOWED `git push -f`, `\rm -rf /`, `(rm -rf /*)`, `rm -rf /"*"` and
 * `git commit --no-verify`; false-DENIED `rm -rf .next && du -sh /`; and ASKED
 * on `git fetch origin main && git push origin feature/x` with a reason that
 * named the wrong segment. Each is a probe case now.
 *
 * v5 (2026-09-10) is yoros's measurement of v4: the protected-branch gate asked only when a command
 * NAMED the branch, so the ordinary deploy sequence — `git checkout main && git merge x && git push`
 * — was allowed end to end, and `git push origin +main` force-pushed it. The branch a segment lands
 * on is now resolved (see "WHICH BRANCH" below), and a `+refspec` is a force-push.
 *
 * v6 (2026-09-11) is yoros CF-4: a fallback was declared per FILE, so one `@twin` passed a hook
 * holding nine rules with no floor behind eight. Every rule now carries its own — see "WHAT STANDS
 * BEHIND EACH RULE" below — and `node bash-gate.js --fallbacks` lists them for the checks to read.
 *
 * A REASON IS ALWAYS SET, INCLUDING ON ALLOW. An empty reason makes an allow
 * indistinguishable from a hook that ran and decided nothing.
 *
 * IT FAILS TO A PROMPT, NEVER TO SILENCE. Unparseable input asks, and so does
 * valid JSON that is not an object: `JSON.parse` accepts a bare string, and
 * reading `tool_input` off one yields `undefined` and a silent allow. That hole
 * shipped green in two projects' copies behind probes that never sent one.
 */
// @event PreToolUse
// @matcher Bash
// @rule-fallbacks --fallbacks

/* KIT:CONFIG twins — the settings rules behind the gates below, as `// @twin <rule>` lines, for
 * the reader: the record of what was probed and why lives best beside the pattern. Optional since
 * v6, when each rule came to carry its own fallback (the fallbacks region, and the third element
 * of your own entries). `check-hook-registration.mjs` reconciles every @twin here against settings
 * AND against those fallbacks, so a line that backs none of the rules is a finding. */
/* KIT:CONFIG /twins */

// THE BRANCH CONFIG IS A MODULE, NOT A REGION HERE, and the reason is the probe.
//
// Until 2026-09-09 `PROTECTED_BRANCH` was declared in a KIT:CONFIG region of THIS file and again
// in one of `bash-gate.probe.mjs`, bound only by a sentence in the probe's region asking a human to
// keep them equal. Set the probe to `master` and leave this at `main` and the probe fails — loud
// and safe. Set THIS to `master` and leave the probe at `main` and the probe PASSES, exercising a
// branch nothing protects while the branch that is protected is never tested. M-KIT-07.
//
// This hook consumes stdin at top level and exports nothing, so the probe cannot import it. A value
// two artefacts must agree on therefore lives in a module they BOTH import — the shape
// `agent-write-scope` reached first (M-KIT-06).
//
// ⚠ PORTING NOTE. This makes the file ESM. If YOUR project has no `"type": "module"`, a `.js` here
// is CommonJS and `import` is a syntax error — Node ≥22.7 reparses it as ESM and prints a
// MODULE_TYPELESS_PACKAGE_JSON warning to stderr on EVERY hook invocation, which is a compensation,
// not a fix, and it is version-dependent. Set `"type": "module"`, or convert this file. Do not
// assume either way. → M-KIT-17.
import { PROTECTED_BRANCH, PROTECTED_REASON } from "./bash-gate.config.mjs";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/* KIT:CONFIG seams — shell variables that, set as a leading assignment, bypass this
 * project's git hooks (a `.githooks` probe seam: `X_HOOK_PROBE=1 git commit …`). An
 * ungated `--no-verify` by another name. Empty means the rule is inert. Setting them
 * through a spawn's `env` object is invisible to this rule by design; only the shell
 * spelling is denied, and the legitimate driver never spells it. */
// M-096. `PLEKS_HOOK_PROBE=1 PLEKS_PRECOMMIT_CMD=true git commit` substitutes the gate command AND
// still writes the gate-ok marker — `--no-verify` that also leaves evidence claiming the gate
// passed. `PLEKS_BRANCH_PROBE` defeats the default-branch guard on its own, with no master switch.
// `check-git-hooks.mjs` sets these through spawnSync's `env` object, never a shell assignment, so
// the legitimate driver is invisible to this rule and needs no carve-out. Kept in step with the
// .githooks by a probe case that reads the seams the gate scripts actually honour.
const SEAM_VARS = ["PLEKS_HOOK_PROBE", "PLEKS_PRECOMMIT_CMD", "PLEKS_PREPUSH_CMD", "PLEKS_DRIFT_CMD", "PLEKS_BRANCH_PROBE"];
/* KIT:CONFIG /seams */

/* KIT:CONFIG deny — this project's own irreversible acts, beyond the canonical set.
 * Each entry is `[rule, reason, fallback]`. A RegExp is tested against ONE SEGMENT's text, so
 * it cannot span `&&`, `;` or `|` into a neighbouring command; a function receives
 * `(tokens, segmentText, command)` for a segment. Prefer `atCommand(tokens, "name")`.
 * The fallback is what stands behind the rule when this hook is not running, in the shape the
 * fallbacks region below describes. An entry without one is a check-hook-registration finding. */
// BOTH ENTRIES RESTORE A DENY THAT CANON SHIPS AS AN ASK, and both were measured against the gate
// this file replaces rather than assumed. Canon's own `ask` region says severity is the project's
// call and names `git reset --hard` as the worked example; this is that, plus one canon did not
// anticipate.
const PROJECT_DENY = [
  // CANON PERMITS THIS ONE DELIBERATELY — `isForcePush` is built on `FORCE_LONG = /^--force(?:=.*)?$/`
  // and its doc line calls `--force-with-lease` and `--force-if-includes` "the SAFE forms". Under
  // canon's design a lease-force falls through to `targetsProtectedBranch`, so it ASKS when it
  // targets main and is ALLOWED on a feature branch. That is coherent policy and this is not a
  // finding against canon — it is a stricter one. CLAUDE.md §3 denies force-push flat, and §5 says a
  // pushed commit is immutable and is fixed FORWARD. The lease changes who loses the race, not
  // whether published history is rewritten: it only refuses when the remote moved since your last
  // fetch, so on a ref nobody else touched it succeeds silently and is a plain force-push wearing a
  // safer name. Measured before restoring: canon returned `ask` on both spellings where the gate
  // this replaces returned `deny`.
  [(t) => atCommand(t, "git") && argsOf(t).includes("push") &&
     argsOf(t).some((a) => a === "--force-with-lease" || a.startsWith("--force-with-lease=") ||
                           a === "--force-if-includes" || a.startsWith("--force-if-includes=")),
   "--force-with-lease is still a force-push — it rewrites published history and only refuses when the remote moved since your last fetch; a pushed commit is fixed forward",
   { twins: ["Bash(git push --force*)"] }],

  // Canon asks. CLAUDE.md §3 lists it under Hook-denied, and the reason is that the thing it
  // destroys is the thing no gate downstream can see: uncommitted work has no reflog entry.
  [(t) => atCommand(t, "git") && argsOf(t).includes("reset") && argsOf(t).includes("--hard"),
   "git reset --hard discards uncommitted work with no undo and no reflog — denied here, not asked",
   { twins: ["Bash(git reset --hard*)"] }],
];
/* KIT:CONFIG /deny */

/* KIT:CONFIG ask — acts that are legitimate but must not happen unattended. Same
 * shape as deny. Severity is yours: a project that wants `git reset --hard` DENIED
 * rather than asked lists it here with its reason and the canon ask never fires. */
const PROJECT_ASK = [
  // CLAUDE.md §3: "announce intent, then push" — this hook is what makes the announcement the
  // CONTENT of an approval rather than a courtesy. Canon has no plain-push rule; its push gates are
  // force, refspec and protected-branch, all narrower than "every push".
  [(t) => atCommand(t, "git") && argsOf(t).includes("push"),
   "pushing to origin requires approval — announce what is in the batch and what was verified",
   { twins: ["Bash(git push*)"] }],

  // ANCHORED ON A PATH BOUNDARY, NOT ON THE SURROUNDING CHARACTERS, and the anchor set is the whole
  // rule. The pattern this replaces was `\.env(\.|["'\s]|$)`, matching `.env` followed by a dot
  // ANYWHERE — so `process.env.NODE_ENV`, `import.meta.env` and `rg "\.env" docs/` all asked, in a
  // hook whose stated posture is unattended autonomy. What separates a path from a property access
  // is what comes BEFORE: an identifier character means a property, a separator means a file.
  // ⚠ THE LEADING SET IS NOT DECORATION — the first anchored cut dropped four separators that carry
  // real reads, found by adversarial review: `cat C:\dev\pleks\.env`, `type .\.env`, `cat <.env`,
  // `echo X >.env` and `cat *.env`. On Windows, this repo's platform, omitting `\` alone un-gated
  // every absolute path to a secrets file. ACCEPTED COST, chosen not discovered: `\` makes
  // `rg "\.env"` ask, because a regex-escape backslash is indistinguishable from a path separator
  // without knowing the command's quoting. An extra prompt on a grep is cheap; a silent read of a
  // secrets file is the thing the rule exists to stop.
  [/(?:^|[\s"'=/\\<>*])\.env(\.|["'\s]|$)/,
   "touching .env files requires approval",
   { twins: ["Read(.env)", "Read(.env.*)"] }],

  // ⚠ A REGEX OVER THE SEGMENT, NOT `atCommand(t, "supabase")`, and the first draft of this entry
  // got it wrong: under `atCommand` the command word of `npx supabase db reset` is `npx`, so the
  // rule matched the bare spelling and missed every runner-prefixed one. Caught by this project's
  // own corpus, which carries both spellings — the same defect class the R4 note below describes,
  // committed while porting the rule that the note is attached to. The operation is "run the
  // supabase CLI's db push/reset", however it is invoked.
  [/\bsupabase\s+db\s+(?:push|reset)\b/,
   "prod database operations require approval",
   { noTwin: "settings matches a command PREFIX and the subcommand sits two words in with global flags legal between them (`supabase --workdir x db push`), so a prefix glob covers one spelling of several. The MCP path to the same act IS twinned — the Supabase mutation tools are in permissions.ask — and mcp-ddl-gate shows the statement before asking; it is the `supabase db` CLI path that settings cannot reach." }],

  // ── R4, control-aim audit 2026-08-22 ──────────────────────────────────────────────────────────
  // The rule above matches the TOOL (`supabase db`) rather than the OPERATION (writes to
  // production) — twin-the-vehicle, inverted. Probed both directions at 5ddbaee1: `supabase db push`
  // asked, and `node supabase/reconcile/apply-prod.mjs --confirm` was ALLOWED. That script's own
  // header says "⚠ WRITES TO PRODUCTION", it posts a whole SQL file through the Management API — and
  // the gate this replaces cited it twice as the source of its ReDoS lesson, so it was read by
  // whoever last hardened the hook and still was not gated.
  // It is not ungoverned: it demands --confirm, refuses any file but 01_reconcile.sql, and refuses a
  // script not wrapped in BEGIN/COMMIT. Those are rung-0 — INSIDE the thing being invoked — and the
  // actor who types --confirm is the actor this hook exists to interrupt. Under the stated
  // unattended-autonomy posture, rung 0 is not a gate.
  // Matched on the SCRIPT PATH, not on `node`: the operation is "run the prod-apply script", however
  // it is spelled. `node x`, `npx tsx x`, an absolute path, a different runner and a bare `./x` all
  // carry the same path token. Backslashes accepted for Windows spellings. Anchored on a separator
  // so a file merely NAMED in prose (`rg apply-prod`) still asks rather than silently differing from
  // the real thing — the same accepted cost as the `.env` rule above.
  [/reconcile[/\\]apply-prod\.mjs/,
   "applying a reconciliation script to PRODUCTION requires approval",
   { noTwin: "the act is running a script, and settings globs a command prefix — the path can appear after any runner (`node`, `npx tsx`, an absolute path, a bare `./`), so no prefix rule reaches the shapes that matter. A twin naming one runner would read as cover for a rule matching one invocation in five." }],
];
/* KIT:CONFIG /ask */

/* KIT:CONFIG fallbacks — what stands behind each of CANON's rules if this hook stops running.
 *
 * One entry per canon rule, keyed by its function's name, in one of two shapes:
 *   { twins: ["Bash(git push *main*)", …] } — rules in settings `permissions.deny` or `.ask`
 *   { noTwin: "why a settings rule cannot say it" } — a reason, never a placeholder
 * Canon ships every entry UNFILLED, because which floor a rule deserves is this project's call,
 * and `check-hook-registration` fails an entry until it is answered. It also fails a twin that is
 * not in settings, and a key naming no rule — a canon rename leaves its fallback behind.
 *
 * WRITE A TWIN IN THE SHAPE SETTINGS READS. `:*` is a wildcard only at the END of a pattern; in
 * `Bash(git merge:*main*)` the colon is literal and the rule matches no command. Write
 * `Bash(git merge *main*)`. The space before a `*` is a word boundary: `Bash(git push --force *)`
 * does not match `--force-with-lease`.
 *
 * SIZE A TWIN AS IF IT IS LIVE. Claude Code's permissions page (read 2026-09-11) says a matching ask
 * rule still prompts when this hook returns allow, and a deny still blocks — so a twin wider than
 * its rule fires on commands the rule allows. life-therapy measured an ask NOT prompting under a
 * live hook on 2026-08-18. Until the two agree, a twin that would be wrong while the hook is alive
 * is a `noTwin`, with that as its reason. */
// ANSWERED AGAINST THE LIVE settings.json, not from memory — every twin below was read out of
// `permissions.deny`/`permissions.ask` before it was written here. The recurring reason for a
// `noTwin` is one fact about settings, stated once and not repeated in full at each entry:
// **settings matches a command PREFIX, and a flag or a target can sit anywhere after the verb.**
// CLAUDE.md §3 already records why the answer is not simply to widen — `Bash(git*)` at ask prompts
// on every `git status`, and a twin that fires constantly is deleted within a day, which trades
// something narrow for nothing.
const CANON_FALLBACKS = {
  // The target is not adjacent to the flags and the flags are not one spelling: `rm -fr /*`,
  // `rm -r -f /`, `rm --recursive --force /*`, `rm --no-preserve-root -rf /`, `rm -rf foo /` and
  // `sudo rm -rf /*` are all the act, and a prefix glob reaches at most the first. life-therapy
  // measured the same gap on the same rule; recorded rather than invented, so the hole is visible
  // instead of implied.
  isDestructiveRm: { noTwin: "the target is an argument that need not follow the flags, and the flags have six live spellings — a prefix glob covers one of them, which reads as cover for a rule matching one shape in six" },

  isForcePush: { twins: ["Bash(git push --force*)", "Bash(git push -f*)"] },

  // `git push origin +main:main`. The `+` sits inside a refspec that comes AFTER the remote name, so
  // a glob would have to enumerate remotes, and settings treats `*` as a wildcard only at the END of
  // a pattern — there is no shape that says "a later argument starting with +".
  isForceRefspec: { noTwin: "the + is inside a refspec positioned after the remote name, and settings has no mid-pattern wildcard — no prefix rule can reach an argument whose position is not fixed" },

  // `git commit -m x --no-verify` is the ordinary spelling and a prefix rule cannot see a flag that
  // trails the message. Denied rather than asked upstream, because the whole point of the flag is to
  // skip the gate the ask would be protecting.
  isNoVerify: { noTwin: "the flag sits anywhere in the line, so `Bash(git commit --no-verify*)` misses `git commit -m x --no-verify`, which is how it is actually written" },

  // `Bash(PLEKS_*)` would cover ONLY the bare leading-assignment spelling. `export PLEKS_HOOK_PROBE=1; git commit`
  // and an assignment sitting behind another (`FOO=1 PLEKS_HOOK_PROBE=1 git commit`) both pass it.
  isSeamAssignment: { noTwin: "a seam assignment need not lead the command — `export X=1; git commit` and `FOO=1 X=1 git commit` both defeat a leading-prefix glob, so a twin would match one shape in three while reading as cover for all of them" },

  // The PUSH half is genuinely covered, by the wider `Bash(git push*)` ask — but that rule is already
  // claimed as the fallback of this project's own push gate, and naming it twice would be a double
  // claim on one settings rule. The MERGE half has no cover at all: the protected branch is an
  // ARGUMENT (`git merge main`, `git push origin main`), and settings cannot bind an argument value.
  // Recorded as uncovered rather than half-twinned, because a fallback naming the half that works is
  // how a gap comes to read as closed.
  targetsProtectedBranch: { noTwin: "the branch is an argument, not a prefix, so settings cannot say `whose target is main`; the push half is incidentally covered by the wider `Bash(git push*)` ask claimed on this project's own push rule, and the merge half is not covered at all" },

  // ADDED TO settings.json IN THIS COMMIT, after the rarity test CLAUDE.md §3 requires: `gh pr merge`
  // is canonically spelled as a prefix, appears only on a deliberate merge, and so cannot become the
  // constantly-firing twin that gets deleted within a day — the measurement that rejected a
  // `Bash(git -C*)` twin for the opposite reason.
  isPrMerge: { twins: ["Bash(gh pr merge*)"] },

  // Pre-empted by this project's PROJECT_DENY entry, which denies rather than asks — canon's rule
  // never fires here. The settings rule behind it is real and is a DENY, so the floor is stronger
  // than the hook's canon severity rather than weaker.
  isHardReset: { twins: ["Bash(git reset --hard*)"] },

  // The force flag clusters (`-fdx`, `-xdf`) and can sit anywhere after `clean`, so a prefix glob
  // matches one spelling and misses the rest — the same reason `--no-verify` carries no twin.
  isForceClean: { noTwin: "the force flag clusters with other letters (`-fdx`, `-xdf`) and its position after `clean` is not fixed, so a prefix glob reaches one spelling of several" },
};
/* KIT:CONFIG /fallbacks */

// ── Canon machinery. Every rule is a token test at command position in one segment. ──

/**
 * Strip the shell punctuation that carries no meaning for these rules, so one token
 * compares as one word: `/"*"` and `'/'*` are both `/*` to the shell, `(rm` hides a
 * command in a subshell, `\rm` is the standard alias-bypass idiom. Quotes come out
 * ANYWHERE, because mid-token is exactly where they were used to hide.
 * A character loop, not a regex: an anchored greedy class backtracks across a run of
 * the same character, and this runs in front of every Bash call.
 */
function normToken(t) {
  const s = t.replace(/["'`]/g, "");
  let i = 0;
  let j = s.length;
  while (i < j && "\\({[".includes(s[i])) i++;
  while (j > i && ")}]".includes(s[j - 1])) j--;
  return s.slice(i, j);
}

/**
 * Commands whose stdin is DATA, never code. A heredoc feeding one of these is prose
 * and its body is masked before any rule runs — so `git commit -F - <<'MSG'` may
 * discuss `rm -rf /` without tripping the gate, which is the workaround this file's
 * v1 advertised and could not honour. An UNLISTED receiver keeps its body (`bash
 * <<EOF`, `python -`, `psql`, `ssh host`): unknown fails toward deny, so a heredoc
 * is never a universal envelope. Extend the list, do not invert it.
 */
const HEREDOC_SINKS = new Set([
  "cat", "tee", "git", "gh", "grep", "egrep", "fgrep", "rg", "sed", "awk", "head", "tail",
  "wc", "sort", "uniq", "cut", "tr", "diff", "less", "more", "jq", "yq", "base64", "md5sum",
  "sha256sum", "curl", "wget", "dd", "od", "xxd", "hexdump", "column", "fold", "paste",
]);

const WRAPPERS = new Set(["sudo", "env", "command", "exec", "nohup", "nice", "time", "builtin"]);

/** Index of the command word in a segment: past leading `VAR=x` assignments and wrappers. */
function commandWordIndex(tokens) {
  let i = 0;
  while (i < tokens.length && (WRAPPERS.has(tokens[i]) || /^[A-Za-z_]\w*=/.test(tokens[i]))) i++;
  return i < tokens.length ? i : -1;
}

/** Is `name` this segment's command (as `name`, `/usr/bin/name`, `\name`, or after `sudo`)? */
function atCommand(tokens, name) {
  const i = commandWordIndex(tokens);
  if (i === -1) return false;
  const t = tokens[i];
  return t === name || t.endsWith("/" + name);
}

/** Everything after the command word — the arguments, as tokens. */
function argsOf(tokens) {
  const i = commandWordIndex(tokens);
  return i === -1 ? [] : tokens.slice(i + 1);
}

/**
 * Mask heredoc BODIES whose receiver is a sink. Opener `<<-?['"]?ID['"]?`; terminator
 * is the bare ID on its own line. No terminator → nothing masked (keep the body,
 * fail toward deny). The receiver is the command word of the last segment on the
 * opener's line before `<<`.
 *
 * ONE PASS. Bare-identifier lines are indexed first, then each opener binary-searches
 * for its terminator — a scan-to-end per opener measured QUADRATIC (20k unterminated
 * openers: 4 s), and a hook that can be made to hang has failed at the one job it has.
 */
function maskSinkHeredocs(command) {
  const lines = command.split("\n");
  const bare = new Map(); // ID → ascending line numbers where the line is exactly that ID
  for (let j = 0; j < lines.length; j++) {
    const m = /^[ \t]*([A-Za-z_]\w*)[ \t]*$/.exec(lines[j]);
    if (m) (bare.get(m[1]) ?? bare.set(m[1], []).get(m[1])).push(j);
  }
  const firstAfter = (list, i) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] > i) hi = mid;
      else lo = mid + 1;
    }
    return lo < list.length ? list[lo] : -1;
  };
  const out = [];
  // Emits line i, and a sink heredoc's masked body if one opens there. Returns the last line
  // consumed — the terminator, or i itself — so the loop never reassigns its own counter.
  const consume = (i) => {
    const line = lines[i];
    out.push(line);
    const m = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line);
    if (!m) return i;
    const before = line.slice(0, m.index);
    const seg = before.split(/[;&|]+/).pop() ?? "";
    const tokens = seg.split(/\s+/).map(normToken).filter(Boolean);
    const cw = commandWordIndex(tokens);
    const receiver = cw === -1 ? "" : tokens[cw].replace(/^.*\//, "");
    if (!HEREDOC_SINKS.has(receiver)) return i;
    const j = firstAfter(bare.get(m[2]) ?? [], i);
    if (j === -1) return i; // unterminated: keep the body
    for (let k = i + 1; k < j; k++) out.push("");
    out.push(lines[j]);
    return j;
  };
  let i = 0;
  while (i < lines.length) i = consume(i) + 1;
  return out.join("\n");
}

/**
 * A command string as SEGMENTS of normalised tokens — one per shell command. Line
 * continuations are joined first, or `\`+newline tears a command in half at exactly
 * the point an attacker would choose. `$(` and backticks open a segment too, so a
 * substitution is a command position and not a hiding place.
 */
function segments(command) {
  return maskSinkHeredocs(command)
    .replace(/\\\r?\n/g, " ")
    .split(/[;&|\n]+|\$\(|`/)
    .map((seg) => ({ text: seg.trim(), tokens: seg.split(/\s+/).map(normToken).filter(Boolean) }))
    .filter((s) => s.tokens.length > 0);
}

/**
 * Blank the TEXT of a `-m`/`--message` value, quotes left in place, before scanning
 * for FLAGS. The message is git's argument, not a switch — denying `git commit -m
 * "we ban --no-verify"` means the gate forbids writing down the rule it enforces.
 * NOT "strip quotes": `git commit "--no-verify"` IS the flag once the shell strips
 * the quotes, and `normToken` treats it so. Only the value of `-m` is inert.
 */
function maskMessageText(command) {
  const out = command.split("");
  const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";
  let i = 0;
  while (i < command.length) {
    let flagLen = 0;
    if (command.startsWith("--message", i)) flagLen = 9;
    else if (command.startsWith("-m", i)) flagLen = 2;
    const after = command[i + flagLen];
    const standalone = flagLen > 0 && (i === 0 || isSpace(command[i - 1])) && (after === undefined || isSpace(after));
    if (!standalone) {
      i++;
      continue;
    }
    let k = i + flagLen;
    while (k < command.length && isSpace(command[k])) k++;
    const quote = command[k];
    if (quote !== '"' && quote !== "'") {
      i = k > i ? k : i + 1;
      continue;
    }
    let end = k + 1;
    while (end < command.length && command[end] !== quote) {
      if (command[end] === "\\") end++;
      end++;
    }
    for (let p = k + 1; p < Math.min(end, command.length); p++) out[p] = " ";
    i = end + 1;
  }
  return out.join("");
}

// A root, a bare home, a drive root, or any of those followed only by more `/` and `*`.
// `/tmp/scratch` and `~/projects` fail because a NAMED segment follows — the two cases
// that separate a gate from a wall.
const LETHAL_TARGET = /^(?:[/~][/*]*|[A-Za-z]:[/\\]?[/*]*|\$\{?HOME\}?[/*]*)$/;
const FORCE_LONG = /^--force(?:=.*)?$/;
// Everything before the FIRST `f` is a letter other than `f`, so there is one way to match and
// nothing to backtrack over. `[A-Za-z]*f` accepted the same strings in quadratic time.
const SHORT_CLUSTER_WITH_F = /^-[A-Za-eg-z]*f[A-Za-z]*$/;

function isDestructiveRm(tokens) {
  return atCommand(tokens, "rm") && argsOf(tokens).some((t) => LETHAL_TARGET.test(t));
}

/** `git … push … --force|-f|-xf` — `--force-with-lease` and `--force-if-includes` are the SAFE forms and pass. */
function isForcePush(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  if (!args.includes("push")) return false;
  return args.some((t) => FORCE_LONG.test(t) || SHORT_CLUSTER_WITH_F.test(t));
}

/** `--no-verify` on the hooked verbs, and `-n` only where `-n` MEANS it (commit, push). */
function isNoVerify(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  const verb = args.find((t) => ["commit", "push", "merge", "revert", "cherry-pick"].includes(t));
  if (!verb) return false;
  if (args.includes("--no-verify")) return true;
  return ["commit", "push"].includes(verb) && args.includes("-n");
}

/** A leading `SEAM_VAR=…` assignment — the only spelling of the seam the Bash tool can reach. */
function isSeamAssignment(tokens) {
  if (SEAM_VARS.length === 0) return false;
  let i = 0;
  if (tokens[0] === "export" || tokens[0] === "env") i = 1;
  for (; i < tokens.length; i++) {
    const eq = tokens[i].indexOf("=");
    if (eq <= 0) break;
    if (SEAM_VARS.includes(tokens[i].slice(0, eq))) return true;
  }
  return false;
}

// ── WHICH BRANCH A GIT ACT LANDS ON, WHEN THE COMMAND DOES NOT SAY (v5, yoros CF-3 and CF-5) ──
//
// v4 asked only when a merge or push NAMED the protected branch. Measured by yoros on the real hook:
//
//   git checkout main && git merge rebuild && git push     allow   ← the ordinary deploy sequence
//   git push  ·  git push origin HEAD  ·  git merge rebuild  allow   (while main is checked out)
//   git push origin rebuild:refs/heads/main                  allow
//   git push --all origin  ·  git push --mirror origin       allow
//   git push origin +main                                    allow   ← a force-push to the deploy branch
//
// L-14's general form, in canon's own hook: a gate that matches how a target APPEARS misses it when
// it is supplied BY REFERENCE. So the target is resolved: the branch a checkout or switch EARLIER IN
// THE SAME COMMAND moved to, else the one `.git/HEAD` names, else UNKNOWN, which asks. What follows is
// yoros's stopgap (`bash-gate.refs.mjs`, mutation-tested 6 of 6), lifted with its reasoning.
//
// ⚠ `.git/HEAD` IS READ ONLY WHEN `CLAUDE_PROJECT_DIR` IS SET, and that is sound rather than
// convenient. Every project registers this hook as `node "$CLAUDE_PROJECT_DIR/.claude/hooks/…"`, so
// a hook running under the harness has it. Unset means a probe or a hand run, and reading the
// probe's own checkout there would make its bare-push cases pass or fail by which branch is out.
// Unset is NOT_READ, which asserts nothing; set and unreadable is UNKNOWN, which asks.
//
// `gh pr merge` merges into the PR's base, which lives on the server and not in the command, so it is
// UNKNOWN and asks, whatever the base turns out to be.
//
// NOT COVERED, stated so it is not mistaken for cover: a push through an alias or a script, and
// `git rebase`/`reset` onto the protected branch, which move the local branch and deploy nothing
// until a push this does see.

/** Outside the harness: no HEAD was read, and nothing is known either way. */
const NOT_READ = undefined;
/** Inside it, and still unknown: detached, unreadable, or another repository. This ASKS. */
const UNKNOWN = null;

/** The branch `.git/HEAD` names, following a `.git` FILE (a worktree or submodule) to its gitdir. */
function readHeadBranch(root) {
  if (!root) return NOT_READ;
  try {
    let gitDir = join(root, ".git");
    if (statSync(gitDir).isFile()) {
      const line = readFileSync(gitDir, "utf8").split(/\r?\n/).find((l) => l.startsWith("gitdir:"));
      if (!line) return UNKNOWN;
      gitDir = resolve(root, line.slice("gitdir:".length).trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const REF = "ref: refs/heads/";
    return head.startsWith(REF) ? head.slice(REF.length).trim() || UNKNOWN : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

let headMemo = null;
function headBranch() {
  if (headMemo === null) headMemo = { v: readHeadBranch(process.env.CLAUDE_PROJECT_DIR || null) };
  return headMemo.v;
}

/**
 * Drop shell redirections, which the tokens keep: `git push > "$LOG" 2>&1` is a probe case, and read
 * as arguments it would make `>` a remote and `$LOG` a refspec, which is an explicit destination and
 * allows. `>` / `2>>` / `&>` take the next token; `>out` / `2>/dev/null` carry theirs.
 */
function dropRedirections(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (/^(?:\d*|&)[<>]{1,2}&?$/.test(t)) {
      i++;
      continue;
    }
    if (/^(?:\d*|&)[<>]/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** git's global options that take a value as the NEXT token, and those that point it elsewhere. */
const GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
const ELSEWHERE = /^(?:-C|--git-dir(?:=.*)?|--work-tree(?:=.*)?)$/;

/** `{ verb, rest, elsewhere }` for a git segment's arguments (the tokens after `git`). */
function gitVerb(args) {
  const a = dropRedirections(args);
  let elsewhere = false;
  let i = 0;
  while (i < a.length && a[i].startsWith("-")) {
    if (ELSEWHERE.test(a[i])) elsewhere = true;
    i += GLOBAL_WITH_VALUE.has(a[i]) ? 2 : 1;
  }
  return { verb: a[i] ?? "", rest: a.slice(i + 1), elsewhere };
}

/** A token that names a PATH rather than a branch: a file checkout leaves the branch alone. */
const looksLikePath = (t) => t.includes(".") || t.includes("\\") || t.startsWith("/");

/**
 * The branch after a `git checkout` / `git switch` segment, given the one before it. A path checkout
 * (`--`, or a file) leaves it alone. `-` and `--detach` make it UNKNOWN: the previous branch is not
 * in the command.
 */
function branchAfter(args, current) {
  const { verb, rest, elsewhere } = gitVerb(args);
  if (elsewhere || (verb !== "checkout" && verb !== "switch")) return current;
  if (rest.includes("--")) return current;
  const create = verb === "checkout" ? ["-b", "-B", "--orphan"] : ["-c", "-C", "--create", "--force-create", "--orphan"];
  for (let i = 0; i < rest.length; i++) {
    if (create.includes(rest[i])) return rest[i + 1] ?? UNKNOWN;
    if (rest[i] === "--detach" || (rest[i] === "-d" && verb === "switch")) return UNKNOWN;
  }
  const positional = rest.filter((t) => !t.startsWith("-") || t === "-");
  if (positional.length === 0) return current;
  if (positional[0] === "-") return UNKNOWN;
  // `--track origin/main` creates and checks out a LOCAL `main`, so the remote prefix comes off.
  const tracks = rest.some((t) => t === "-t" || t === "--track" || t.startsWith("--track="));
  if (tracks && positional.length === 1 && positional[0].includes("/")) return positional[0].slice(positional[0].indexOf("/") + 1);
  if (positional.length > 1 || looksLikePath(positional[0])) return current;
  return positional[0];
}

/** A path for comparison: forward slashes, `/c/` as `c:/`, lower case, no trailing slash. */
function normPath(p) {
  let s = p.replace(/\\/g, "/").replace(/^\/([a-z])\//i, "$1:/").toLowerCase();
  while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** The branch after a `cd` / `pushd`: the same one if it stays in this repository, else UNKNOWN. */
function branchAfterCd(target, current, root) {
  if (target === undefined || target === "-" || target === "~" || target.startsWith("~/")) return UNKNOWN;
  const absolute = /^(?:\/|[A-Za-z]:[\\/])/.test(target);
  if (!absolute) return target.split(/[\\/]/).includes("..") ? UNKNOWN : current;
  if (!root) return UNKNOWN;
  const t = normPath(target);
  const r = normPath(root);
  return t === r || t.startsWith(r + "/") ? current : UNKNOWN;
}

/** `git push` options that take a value as the NEXT token; those that push every branch. */
const PUSH_WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
const PUSH_ALL = new Set(["--all", "--mirror", "--branches"]);
/** The current-branch aliases a refspec may use. */
const SELF_REF = new Set(["HEAD", "@"]);

/**
 * What a `git push`'s arguments land on: `{ all, current, branches, forced }`. `all` is --all /
 * --mirror. `current` is a push of the checked-out branch (no refspec, or `HEAD`). `branches` are the
 * destination BRANCH names, with `+` and `refs/heads/` taken off. `forced` is any `+refspec`.
 */
function pushTargets(rest) {
  const flags = [];
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith("-")) {
      flags.push(t);
      if (PUSH_WITH_VALUE.has(t)) i++;
    } else positional.push(t);
  }
  const refspecs = positional.slice(1);
  const all = flags.some((f) => PUSH_ALL.has(f));
  const tagsOnly = refspecs.length === 0 && flags.includes("--tags");
  const out = { all, current: false, branches: [], forced: false };
  if (refspecs.length === 0) {
    out.current = !all && !tagsOnly;
    return out;
  }
  for (const spec of refspecs) {
    if (spec.startsWith("+")) out.forced = true;
    const s = spec.startsWith("+") ? spec.slice(1) : spec;
    const colon = s.lastIndexOf(":");
    const src = colon === -1 ? s : s.slice(0, colon);
    const dst = colon === -1 ? s : s.slice(colon + 1) || src;
    if (SELF_REF.has(dst) || (colon === -1 && SELF_REF.has(src))) out.current = true;
    else out.branches.push(dst.startsWith("refs/heads/") ? dst.slice("refs/heads/".length) : dst);
  }
  return out;
}

/**
 * Does segment `index` merge, pull or push into the protected branch? `plan` is every segment as
 * `{ kind: "git" | "cd" | "popd" | "other", args }`; the segments before `index` say which branch is
 * checked out when this one runs.
 */
function reachesProtected(plan, index, { protectedBranch, head, root }) {
  let current = head;
  for (let i = 0; i < index; i++) {
    const s = plan[i];
    if (s.kind === "git") current = branchAfter(s.args, current);
    else if (s.kind === "cd") current = branchAfterCd(s.args.find((t) => !t.startsWith("-")), current, root);
    else if (s.kind === "popd") current = UNKNOWN;
  }
  const s = plan[index];
  if (s.kind !== "git") return false;
  const { verb, rest, elsewhere } = gitVerb(s.args);
  const here = elsewhere ? UNKNOWN : current;
  // NOT_READ (outside the harness) is not UNKNOWN: nothing was read, so nothing is asserted.
  const onProtected = here === protectedBranch || here === UNKNOWN;
  if (verb === "merge") {
    if (rest.some((t) => ["--abort", "--quit", "--continue"].includes(t))) return false;
    return onProtected;
  }
  if (verb === "pull") {
    // A bare pull syncs the branch with its own upstream. Naming ANOTHER branch merges it in.
    const positional = rest.filter((t) => !t.startsWith("-"));
    const merged = positional.slice(1).map((t) => (t.startsWith("+") ? t.slice(1) : t).split(":")[0]);
    return merged.some((b) => b !== here) && onProtected;
  }
  if (verb === "push") {
    const t = pushTargets(rest);
    if (t.all) return true;
    if (t.branches.includes(protectedBranch)) return true;
    return t.current && onProtected;
  }
  return false;
}

const planOf = (segs) =>
  segs.map((s) => ({
    kind: atCommand(s.tokens, "git") ? "git"
      : atCommand(s.tokens, "cd") || atCommand(s.tokens, "pushd") ? "cd"
      : atCommand(s.tokens, "popd") ? "popd" : "other",
    args: argsOf(s.tokens),
  }));

function targetsProtectedBranch(tokens, _text, _command, ctx) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  const b = PROTECTED_BRANCH;
  // NAMED: v4's test, kept whole. Every command it asked on still asks.
  if ((args.includes("push") || args.includes("merge")) &&
    args.some((t) => t === b || t === `origin/${b}` || t === `refs/heads/${b}` || t.endsWith(`:${b}`))) return true;
  // BY REFERENCE: everything else that lands there.
  if (!ctx) return false;
  return reachesProtected(ctx.plan, ctx.index, { protectedBranch: b, head: headBranch(), root: process.env.CLAUDE_PROJECT_DIR || null });
}

/**
 * `git push origin +main`: a `+` on a refspec IS `--force` for that ref. v4 read it as a branch name
 * that did not equal `main`, and allowed it (yoros CF-5). Denied with or without a lease flag beside
 * it: what `+` does alongside `--force-with-lease` is not something this file should have to know.
 */
function isForceRefspec(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const { verb, rest } = gitVerb(argsOf(tokens));
  return verb === "push" && pushTargets(rest).forced;
}

/** `gh pr merge`: the base branch is on the server, so the command cannot say where this lands. */
function isPrMerge(tokens) {
  if (!atCommand(tokens, "gh")) return false;
  const args = argsOf(tokens);
  const i = args.indexOf("pr");
  return i !== -1 && args[i + 1] === "merge";
}

function isHardReset(tokens) {
  return atCommand(tokens, "git") && argsOf(tokens).includes("reset") && argsOf(tokens).includes("--hard");
}

function isForceClean(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  return args.includes("clean") && args.some((t) => t === "--force" || SHORT_CLUSTER_WITH_F.test(t));
}

const CANON_DENY = [
  [isDestructiveRm, "rm aimed at a filesystem root or home directory"],
  [isForcePush, "force-push without --force-with-lease"],
  [isForceRefspec, "a +refspec force-pushes that ref — push without the +, or use --force-with-lease"],
  [isNoVerify, "--no-verify (or -n on commit/push) skips the project's own gate"],
  [isSeamAssignment, "sets a hook probe seam — the gate would report PASSED without running"],
];
const CANON_ASK = [
  [targetsProtectedBranch, PROTECTED_REASON],
  [isPrMerge, "gh pr merge merges into the PR's base branch, which is on the server and not in this command — if it is the protected branch, this is the deploy"],
  [isHardReset, "git reset --hard discards uncommitted work with no undo"],
  [isForceClean, "git clean -f deletes untracked files permanently — drafts are untracked until committed"],
];

// A function rule also receives `{ plan, index }`: every segment's kind and arguments, and which one
// this is. Only the protected-branch rule reads it — which branch a segment lands on is decided by
// the segments before it — and a project rule may ignore it.
const fires = (rule, seg, command, ctx) =>
  typeof rule === "function" ? rule(seg.tokens, seg.text, command, ctx) : rule.test(seg.text);

function decide(command) {
  // Flag scans run on the message-masked text; the rm rule on the unmasked text, so
  // `-m "rm -rf /"` is prose either way (rm is not at command position there).
  const segs = segments(maskMessageText(command));
  const plan = planOf(segs);
  const hit = (rule) => segs.some((s, index) => fires(rule, s, command, { plan, index }));
  for (const [rule, why] of [...CANON_DENY, ...PROJECT_DENY]) {
    if (hit(rule)) return ["deny", why];
  }
  for (const [rule, why] of [...CANON_ASK, ...PROJECT_ASK]) {
    if (hit(rule)) return ["ask", why];
  }
  return ["allow", "allowed — no gate matched"];
}

// ── v6: WHAT STANDS BEHIND EACH RULE IF THIS HOOK STOPS RUNNING (yoros CF-4) ──
//
// L-16: a rule held at the hook layer alone needs a fallback, reconciled as a set difference. Until
// v6 the fallback was declared per FILE — one `@twin` line anywhere passed — so the difference taken
// was twins against settings, and rules against twins was never taken: two twins backed one rule of
// nine and the check was green. The fallback now sits ON the rule, and this lists every rule with
// its fallback, so a count can see a rule that has none. Canon's rules take theirs from the
// fallbacks region by function name; a project's carry theirs as the third element of the entry.
//
// `node bash-gate.js --fallbacks` prints the list as JSON and reads no stdin. Claude Code never
// passes an argument, so a gating run cannot reach it. `inert` marks the one rule that cannot fire:
// the seam rule, with no seams configured, needs no floor until it has something to hold.
function inventory() {
  const canonRule = (severity) => ([rule, reason]) => ({
    severity,
    owner: "canon",
    rule: rule.name,
    reason,
    fallback: Object.hasOwn(CANON_FALLBACKS, rule.name) ? CANON_FALLBACKS[rule.name] : null,
    inert: rule === isSeamAssignment && SEAM_VARS.length === 0,
  });
  const projectRule = (severity, table) => ([, reason, fallback], i) => ({
    severity,
    owner: "project",
    rule: `${table}[${i}]`,
    reason,
    fallback: fallback ?? null,
    inert: false,
  });
  const names = new Set([...CANON_DENY, ...CANON_ASK].map(([rule]) => rule.name));
  return {
    rules: [
      ...CANON_DENY.map(canonRule("deny")),
      ...PROJECT_DENY.map(projectRule("deny", "PROJECT_DENY")),
      ...CANON_ASK.map(canonRule("ask")),
      ...PROJECT_ASK.map(projectRule("ask", "PROJECT_ASK")),
    ],
    strays: Object.keys(CANON_FALLBACKS).filter((k) => !names.has(k)),
  };
}

/** The gating run: one hook payload on stdin, one decision on stdout. */
function gate() {
  const chunks = [];
  process.stdin.on("data", (d) => chunks.push(d));
  process.stdin.on("end", () => {
    let decision = "allow";
    let reason = "bash-gate: allowed — no gate matched";
    try {
      // Buffers, not string concatenation: a multibyte character split across chunks
      // would corrupt the JSON. A leading BOM (Windows) is stripped — written as the
      // escape so it survives a diff, an editor and a control-byte assertion.
      const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
      const input = JSON.parse(raw);
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("hook input is not an object");
      }
      const command = String(input.tool_input?.command ?? "");
      const [d, why] = decide(command);
      decision = d;
      reason = "bash-gate: " + why;
    } catch {
      decision = "ask";
      reason = "bash-gate: could not parse hook input — failing to a prompt, not to silence";
    }
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
      }),
    );
  });
}

if (process.argv.includes("--fallbacks")) {
  process.stdout.write(JSON.stringify(inventory()));
} else {
  gate();
}
