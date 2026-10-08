/**
 * bash-gate.js — PreToolUse gate for Bash. KIT FILE, install at `.claude/hooks/`.
 *
 * @kit bash-gate v17 — tracked OUTSIDE its `KIT:CONFIG` regions. Those regions are yours;
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
 * v7 (2026-09-11) is pleks CF-8, CF-9 and yoros CF-10, and it is the first version measured against
 * the gate it replaces rather than only against its own cases. Run beside pleks's previous gate, v6
 * ALLOWED 15 of 15 payloads that gate denied or asked, and yoros found the same class on its own.
 * Three causes, each a piece of bash read wrongly:
 *   - COMMAND POSITION. The command word was found past a fixed list of BARE wrappers. `timeout 30`,
 *     `bash -c`, `eval`, `xargs`, `sudo -E`, `nice -n 10`, `then` and `!` all moved the real
 *     command off it, and every rule missed. See "WHERE THE COMMAND IS".
 *   - HEREDOC MASKING hid a here-string's following lines (`<<<`), a body piped on to `sh`, and
 *     `$(…)` in an unquoted body, all of which bash runs.
 *   - THE MESSAGE MASK read `\` as an escape inside single quotes, where bash does not, so `-m 'a\'`
 *     never closed and the mask blanked the command after it.
 * Also: `git push -n` is a dry run and is no longer denied as `--no-verify` (yoros CF-10); `git merge
 * main` names its SOURCE and no longer asks on a working branch (pleks CF-8); `--mirror` is denied as
 * the force-push it is; and the abbreviations git accepts (`--no-veri`, `--har`) and
 * `-c core.hooksPath=` read as what they spell.
 *
 * THE PROBE NOW TAKES `--against <previous bash-gate.js>` (pleks CF-10): every case through both
 * gates, failing on any verdict that got LOOSER unless this version declares it. A replacement
 * gate's own cases assert what its author intended, and the previous corpus asserts the old
 * mechanisms, so a regression sits in the gap between the two suites, where neither has a case.
 *
 * v8 (2026-09-11) is yoros CF-11: the message mask read only a standalone `-m`, so `git commit -am
 * "never use --no-verify"` was denied for its own message. Testing that fix found two holes the mask
 * had held since v6, both in the other direction: it blanked a double-quoted message's `$(…)` and
 * backticks, which the shell runs, so `git commit -m "$(git push -f)"` was ALLOWED; and it began a
 * message at a `-m` that was itself inside quotes, so `echo " -m '" && git push -f && echo "'"` was
 * masked from the inner quote onward and allowed. See "THE FLAG IS `-m`". Against v7: 4 verdicts
 * looser, all four the message, and 3 stricter.
 *
 * v10 (2026-10-05): a quoted separator after a data command is text. See "A QUOTED SEPARATOR".
 *
 * v11 (2026-10-06) is blindly's walk 02 of its G-10 gate: `git -c alias.q="!rm -rf /*" q` was
 * ALLOWED by every version, because git runs a config value that no rule read at command position.
 * See "A STRING GIT RUNS IS A COMMAND". No rule is added, so no fallback is owed: the existing rules
 * read one more kind of position, as the backstop's do.
 *
 * v12 (2026-10-06) is blindly CF-6 and CF-7, both measured on win32 and reproduced in canon: the
 * command word was compared as typed, so `git.exe push --force` and `rm.exe -rf /*` were ALLOWED (see
 * "HOW A COMMAND IS SPELLED"); and v11's strings missed an assignment behind a wrapper, `SSH_ASKPASS`,
 * and the `ext::` transport. No rule is added, so no fallback is owed.
 *
 * v13 (2026-10-06) is pleks CF-18: every bare act was gated, and the same act was ALLOWED once text
 * carried it to something that runs text — `echo 'rm -rf ~' | bash`, `sh <<< '…'`, `pwsh -c "…"`,
 * `python -c "os.system('…')"`, `sed '1e …'`, `awk 'BEGIN{system("…")}'`, a heredoc into `node -`,
 * and `rm -rf $(echo ~)`. The gate decided quoted text was prose from the token that held it, never
 * from what consumed it. See "WHAT CONSUMES TEXT DECIDES WHETHER IT IS TEXT". No rule is added, so
 * no fallback is owed: the existing rules read the consumed text, and the rm rule reads one more
 * kind of target.
 *
 * v14 (2026-10-06) is blindly CF-8: a QUOTED path to an executable was split at its space, so
 * `"C:/Program Files/Git/cmd/git.exe" push --force` read as the command `C:/Program` and every rule
 * allowed it — Git for Windows' default install path. A segment whose shell words differ from its
 * tokens is now read a second time as those words (`segments`' `words`), appended after every other
 * segment as v13's are, so every changed verdict is stricter. No rule is added, so no fallback is owed.
 *
 * v15 (2026-10-08) is blindly CF-10: v14 chose between the two readings by comparing their COUNTS,
 * and a quoted whitespace-only word (`# " "`) is one word and no token, which cancelled the path's
 * split and re-opened every case CF-8 closed. The words are now read whenever the two lists differ
 * at any position. Deciding by a count fails open to any input that moves both counts alike.
 *
 * v16 (2026-10-08) is pleks's v15 scout: a shell can be handed text no word of the command holds —
 * a process substitution's output (`source <(…)`, `bash <(…)`), a substitution's output as the
 * command word, a file written and run in the same command, and `npx -c`. All seven measured shapes
 * were ALLOWED; see "WHAT A COMMAND RUNS THAT IT NEVER QUOTED". No rule is added, so no fallback is
 * owed. A file written by an EARLIER Bash call is out of reach of any reader of command text.
 *
 * v17 (2026-10-08) is pleks CF-21: the set of runners is open — `cmd //c`, wsl, find -exec, su, flock,
 * busybox, ssh, docker exec, `npm pkg set scripts.x=`, git's filters and --exec were all ALLOWED. So a
 * program the gate does not know has every multi-word argument, and every `key=value`'s value, read
 * as a command; see "A STRING HANDED TO A PROGRAM THE GATE DOES NOT KNOW". The declared cost: such a
 * string naming a gated act is gated as if run. No rule is added, so no fallback is owed.
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
// pleks (M-096): `.githooks/pre-commit` and `pre-push` substitute these for the gate command, and
// `PLEKS_BRANCH_PROBE` is a second, independent vehicle that needs no master switch. All five denied.
const SEAM_VARS = ["PLEKS_HOOK_PROBE", "PLEKS_PRECOMMIT_CMD", "PLEKS_PREPUSH_CMD", "PLEKS_DRIFT_CMD", "PLEKS_BRANCH_PROBE"];
/* KIT:CONFIG /seams */

/* KIT:CONFIG deny — this project's own irreversible acts, beyond the canonical set.
 * Each entry is `[rule, reason, fallback]`. A RegExp is tested against ONE SEGMENT's text, so
 * it cannot span `&&`, `;` or `|` into a neighbouring command; a function receives
 * `(tokens, segmentText, command)` for a segment. Prefer `atCommand(tokens, "name")`.
 * The fallback is what stands behind the rule when this hook is not running, in the shape the
 * fallbacks region below describes. An entry without one is a check-hook-registration finding. */
// THE FOREIGN-RUNNER BACKSTOP (CF-21; walks 01–03 in .handoff/kit-bash-gate-v16/). Canon reads a quoted
// string only when it is handed to a runner in ITS table. Handed to any other runner (`cmd //c "…"`,
// `wsl sh -c`, `find -exec sh -c`, `filter-branch`, `npm pkg set`+`npm run`, `npx concurrently`) it is an
// argument and allowed, though the held gate — which read raw text — denied it.
//
// WHAT THIS PROMISES, AND WHY IT IS THIS AND NOT MORE: a command that names such a runner gets AT LEAST
// the held gate's verdict, so on THOSE commands the gate is never looser than what it replaced. A runner
// on no list is not covered (CF-22: `bun x`, `git bisect run`, `gh alias --shell`). The held
// gate's rules are carried below VERBATIM (98d8a9a0, `held*`), rather than re-derived as "each act's
// direct verdict". Two re-derivations were walked and both failed: a regex version was CUBIC (36 KB
// behind `cmd //c` got no decision, and a killed hook fails open), and a word-reading version missed
// runners not at the head of a command (`start cmd //c`, `if cmd //c`, `sudo -u x cmd //c`) and cmd's
// own `^` escape, while false-denying routine `npx … && git commit -m "$(…)"`. Reading the held gate's
// way inherits exactly its blind spots (variables, `$'…'`, brace expansion) and its accepted false
// denies, and nothing else — which is the bar CF-18 set: no regression against the held gate.
//
// Every scan here is a single pass or a split; no regex can backtrack over a run of input. Memoised on
// the full command, so the per-segment calls cost one read.
const HELD_SEAM_VARS = ["PLEKS_HOOK_PROBE", "PLEKS_PRECOMMIT_CMD", "PLEKS_PREPUSH_CMD", "PLEKS_DRIFT_CMD", "PLEKS_BRANCH_PROBE"];
// The held gate's `normToken` is byte-identical to canon's, so canon's is used.
function heldSegments(command) {
  return command
    .replace(/\\\r?\n/g, " ")
    .split(/[;&|\n]+/)
    .map((seg) => seg.split(/\s+/).map(normToken).filter(Boolean));
}
function heldCommandIndex(tokens, name) {
  return tokens.findIndex((t) => t === name || t.endsWith(`/${name}`));
}
function heldDestructiveRm(command) {
  const LETHAL_TARGET = /^[/~][/*]*$/;
  for (const tokens of heldSegments(command)) {
    const at = heldCommandIndex(tokens, "rm");
    if (at !== -1 && tokens.slice(at + 1).some((t) => LETHAL_TARGET.test(t))) return true;
  }
  return false;
}
function heldForcePush(command) {
  const FORCE = /^(?:-f|--force(?:-with-lease)?(?:=.*)?)$/;
  for (const tokens of heldSegments(command)) {
    const git = heldCommandIndex(tokens, "git");
    if (git === -1 || !tokens.slice(git + 1).includes("push")) continue;
    if (tokens.slice(git + 1).some((t) => FORCE.test(t))) return true;
  }
  return false;
}
function heldForceClean(command) {
  const SHORT_F = /^-[a-eg-z]*f[a-z]*$/;
  for (const tokens of heldSegments(command)) {
    const git = heldCommandIndex(tokens, "git");
    if (git === -1) continue;
    const args = tokens.slice(git + 1);
    if (args.includes("clean") && args.some((t) => t === "--force" || SHORT_F.test(t))) return true;
  }
  return false;
}
function heldMaskMessageText(command) {
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
function heldNoVerify(command) {
  const LONG_VERBS = ["commit", "push", "merge", "revert", "cherry-pick"];
  const SHORT_VERBS = ["commit", "push"];
  for (const tokens of heldSegments(heldMaskMessageText(command))) {
    const git = heldCommandIndex(tokens, "git");
    if (git === -1) continue;
    const rest = tokens.slice(git + 1);
    const verb = rest.find((t) => LONG_VERBS.includes(t));
    if (!verb) continue;
    if (rest.includes("--no-verify")) return true;
    if (SHORT_VERBS.includes(verb) && rest.includes("-n")) return true;
  }
  return false;
}
function heldHookSeamAssignment(command) {
  for (const tokens of heldSegments(command)) {
    let i = tokens[0] === "export" || tokens[0] === "env" ? 1 : 0;
    for (; i < tokens.length; i++) {
      const eq = tokens[i].indexOf("=");
      if (eq <= 0) break;
      if (HELD_SEAM_VARS.includes(tokens[i].slice(0, eq))) return true;
    }
  }
  return false;
}
function heldVerdict(command) {
  if (heldForcePush(command) || /git\s+reset\s+--hard/.test(command) || heldDestructiveRm(command) ||
    heldNoVerify(command) || heldHookSeamAssignment(command)) return "deny";
  // All five of held's asks, `.env` included: PROJECT_ASK's own `.env` rule reads canon's masked text, so
  // a body run from a sink heredoc (`cat >x.bat <<EOF … type .env` then `cmd //c x.bat`) only reaches
  // it here (floor walk F2).
  if (/git\s+push\b/.test(command) || heldForceClean(command) || /(?:^|[\s"'=/\\<>*])\.env(\.|["'\s]|$)/.test(command) ||
    /supabase\s+db\s+(push|reset)/.test(command) || /reconcile[/\\]apply-prod\.mjs/.test(command)) return "ask";
  return null;
}

// Which commands name a runner canon does not read. Rare names count ANYWHERE; names that are also
// common words (`watch`, `start`, `script`, `parallel`, `su`) count only at command position — first in
// a command, or after a keyword or prefix — so a PR body that says "watch" or "start" is not a runner.
// `find`, `git`, `npm`, `pnpm`, `yarn` count only with the flag that makes them run a string. A word is
// read as the shell and cmd read it: quotes and cmd's `^` removed, a backslash either an escape
// (`c\md` is `cmd`) or a path separator (`C:\…\cmd.exe`), and the program past its last `/` or `=`.
const RUNNERS_ANYWHERE = new Set(["cmd", "wsl", "runuser", "flock", "setsid", "busybox", "mintty", "winpty", "npx", "pnpx", "bunx",
  "ssh", "cross-env", "tmux", "forfiles"]);
// npm, pnpm and yarn run a string through these subcommands, after any options and in any abbreviation
// npm accepts (`npm --yes exec -c`, `npm exe -c`; floor walk F1): any later word counts, not the next.
const PM_RUNNING = new Set(["exec", "exe", "x", "dlx", "pkg", "explore"]);
const RUNNERS_AT_COMMAND = new Set(["watch", "start", "script", "parallel", "su"]);
const COMMAND_PREFIXES = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "time", "xargs", "start", "winpty",
  "exec", "command", "builtin", "env", "nohup", "nice", "timeout", "sudo", "doas", "stdbuf"]);
const RUNNER_BREAKS = new Set([";", "&", "|", "(", ")", "`", "\n", "\r"]);
const RUNNER_SPACE = new Set([" ", "\t", "\f", "\v"]);
// Windows extensions as canon's `commandName` strips them: the npm shims are `npx.cmd`, `pnpm.cmd`.
const programOf = (s) => s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("=")) + 1).toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, "");
function runnerWordsOf(text) {
  const cmds = [[]];
  let esc = "";
  let path = "";
  const flush = () => {
    if (esc || path) cmds.at(-1).push({ w: esc, names: [programOf(esc), programOf(path)] });
    esc = "";
    path = "";
  };
  for (const ch of text) {
    if (ch === '"' || ch === "'" || ch === "^") continue;
    if (ch === "\\") {
      path += "/";
      continue;
    }
    if (RUNNER_SPACE.has(ch)) {
      flush();
      continue;
    }
    if (RUNNER_BREAKS.has(ch)) {
      flush();
      if (cmds.at(-1).length) cmds.push([]);
      continue;
    }
    esc += ch;
    path += ch;
  }
  flush();
  return cmds;
}
function namesRunner(words) {
  const is = (x, set) => x.names.some((n) => set.has(n));
  const named = (x, n) => x.names.includes(n);
  const ws = words.map((x) => x.w);
  let atCommand = true;
  for (const x of words) {
    if (is(x, RUNNERS_ANYWHERE)) return true;
    if (atCommand && is(x, RUNNERS_AT_COMMAND)) return true;
    // Position: a prefix, an option, a number or an assignment AT command position keeps it there; the
    // same words in prose ("deploy, then start") do not create one.
    atCommand = atCommand && (is(x, COMMAND_PREFIXES) || /^[-0-9]/.test(x.w) || /^[A-Za-z_]\w*=/.test(x.w));
  }
  if (words.some((x) => named(x, "find")) && ws.some((w) => w === "-exec" || w === "-execdir" || w === "-ok" || w === "-okdir")) return true;
  if (words.some((x) => named(x, "script")) && ws.includes("-c")) return true;
  if (words.some((x) => named(x, "git")) && (ws.includes("filter-branch") || ws.includes("filter-repo") ||
    (ws.includes("rebase") && ws.some((w) => w === "-x" || w === "--exec" || w.startsWith("--exec="))))) return true;
  const pm = words.findIndex((x) => named(x, "npm") || named(x, "pnpm") || named(x, "yarn"));
  return pm !== -1 && ws.slice(pm + 1).some((w) => PM_RUNNING.has(w));
}
let runnerMemo = { command: null, verdict: null };
function runnerVerdict(command) {
  const raw = String(command ?? "");
  if (runnerMemo.command === raw) return runnerMemo.verdict;
  // Canon's masking first, so a commit message or a sink heredoc body naming a runner is prose.
  const text = maskSinkHeredocs(maskMessageText(raw)).replace(/\\\r?\n/g, " ");
  // Read twice: as written, and with cmd's `^` escapes removed (`git^ push` is `git push` to cmd, and
  // the held gate missed it too). The worse verdict stands.
  let verdict = null;
  if (runnerWordsOf(text).some(namesRunner)) {
    const both = [heldVerdict(raw), raw.includes("^") ? heldVerdict(raw.replaceAll("^", "")) : null];
    verdict = both.find((v) => v === "deny") ?? both.find((v) => v === "ask") ?? null;
  }
  runnerMemo = { command: raw, verdict };
  return verdict;
}
const PROJECT_DENY = [
  // Held gate: `[/git\s+reset\s+--hard/, "hard reset is denied"]` — canon only ASKS on this.
  [isHardReset, "hard reset is denied — it discards uncommitted work with no undo and no reflog", { twins: ["Bash(git reset --hard*)"] }],
  // Held gate: `isForcePush` denied `--force-with-lease` as a force push, and pleks's own
  // `scripts/check-bash-gate.mjs` asserts it ("force-with-lease is still a force push"). Canon lets
  // the lease through as the safe form. POLICY, not prose: kept denied here, so pushes cannot
  // overwrite a remote ref on any spelling. `--force-if-includes` stays an ordinary (asked) push,
  // as it was in the held gate. The settings twin `git push --force*` has no word boundary, so it
  // already matches `--force-with-lease`.
  [(t) => {
    if (!atCommand(t, "git")) return false;
    const a = argsOf(t);
    return a.includes("push") && a.some((x) => x.startsWith("--force-with-lease"));
  }, "force-with-lease is still a force push — it overwrites the remote ref, and is denied", { twins: ["Bash(git push --force*)"] }],
  // The foreign-runner backstop (above): a denied act handed as text to a runner canon does not read.
  [(_t, _text, command) => runnerVerdict(command) === "deny",
    "a denied act handed as text to a runner (cmd //c, wsl, find -exec, filter-branch, rebase --exec, npm pkg set, su, flock…) is run by it — denied", { noTwin: "the runner and the act are words anywhere in one command; settings speak in prefix globs and cannot express that" }],
];
/* KIT:CONFIG /deny */

/* KIT:CONFIG ask — acts that are legitimate but must not happen unattended. Same
 * shape as deny. Severity is yours: a project that wants `git reset --hard` DENIED
 * rather than asked lists it here with its reason and the canon ask never fires. */
const PROJECT_ASK = [
  // CLAUDE.md §3: EVERY push asks (the push announcement is the content of the approval), not only
  // one to the protected branch. The subcommand is the first non-option argument after `git`,
  // skipping the values of `-C <dir>` / `-c <k=v>`, so `git -C /x push` asks (the held gate's
  // regex missed it) while `git stash push` and `git log push` do not.
  [(t) => {
    if (!atCommand(t, "git")) return false;
    const a = argsOf(t);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === "-C" || a[i] === "-c") { i++; continue; }
      if (a[i].startsWith("-")) continue;
      return a[i] === "push";
    }
    return false;
  }, "pushing to origin requires approval", { twins: ["Bash(git push*)"] }],
  // `.env` must START a path token (start, whitespace, quote, `=`, `/`, `\`, `<`, `>`, `*`) and be
  // followed by `.`, a quote, whitespace or end — so `process.env.NODE_ENV` stays allowed.
  // ACCEPTED COST (held gate's own): `rg "\.env" docs/` asks.
  [/(?:^|[\s"'=/\\<>*])\.env(\.|["'\s]|$)/, "touching .env files requires approval", { twins: ["Read(.env)", "Read(.env.*)"] }],
  [/supabase\s+db\s+(push|reset)/, "prod database operations require approval", { noTwin: "the MCP path is covered by mcp-ddl-gate and its settings asks; the `supabase db` CLI has no settings spelling that is not also every `supabase` command" }],
  [/reconcile[/\\]apply-prod\.mjs/, "applying a reconciliation script to PRODUCTION requires approval", { noTwin: "the script is run as `node supabase/reconcile/apply-prod.mjs`, and a `Bash(node *)` ask would fire on every script in the repo" }],
  // Walker F1's ask half — see the runner entry in PROJECT_DENY.
  [(_t, _text, command) => runnerVerdict(command) === "ask",
    "a push, forced clean or prod DB act handed as text to a runner (cmd //c, wsl, find -exec, npm pkg set…) requires approval", { noTwin: "the runner and the act are words anywhere in one command; settings speak in prefix globs and cannot express that" }],
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
 * A TWIN IS LIVE WHILE THIS HOOK RUNS. Measured on Claude Code 2.1.235 (yoros and life-therapy,
 * 2026-09-11): a matching settings ask still prompts when this hook returns allow, and a deny still
 * blocks, as the permissions page says. So a twin wider than its rule costs a prompt, in normal
 * work, on every command the rule allows. That cost is a reason to narrow the twin. It is never a
 * reason to delete it. L-15 records the August reading that said otherwise, and why it no longer
 * holds. The harness also strips most wrappers (`timeout`, `nice -n`, `env -i`, `sudo -u`) before
 * matching, so a twin already covers most wrapped spellings of its command. */
const CANON_FALLBACKS = {
  isDestructiveRm: { noTwin: "no settings pattern was ever written for rm at a root or home: the target is a token anywhere after `-rf`, and a prefix glob matches one spelling in many" },
  isForcePush: { twins: ["Bash(git push --force*)", "Bash(git push -f*)"] },
  isForceRefspec: { twins: ["Bash(git push*)"] },
  isNoVerify: { noTwin: "a settings pattern matches a command PREFIX and the flag can sit anywhere (`git commit -m x --no-verify`), so `Bash(git commit --no-verify*)` would miss the ordinary spelling" },
  isSeamAssignment: { noTwin: "`Bash(PLEKS_*)` would cover only the bare leading-assignment spelling; `export X=1; git commit` and an assignment behind another both pass a prefix glob" },
  targetsProtectedBranch: { twins: ["Bash(git push*)"] },
  isPrMerge: { noTwin: "no settings rule was written for `gh pr merge`; the held gate allowed it and canon asks, so the gate is the only holder" },
  isHardReset: { twins: ["Bash(git reset --hard*)"] },
  isForceClean: { noTwin: "the force flag can sit anywhere after `clean` and clusters with other letters (`-fdx`, `-xdf`), so a settings prefix glob matches one spelling and misses the rest" },
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

// ── WHERE THE COMMAND IS (v7, pleks CF-9 ①, yoros CF-10 (a)) ──
//
// Every rule is a test at COMMAND POSITION, so the whole gate is only as good as the reader that
// finds that position. v6 stepped over `VAR=x` and eight bare words. Measured in both projects, it
// then read `timeout` in `timeout 30 git push -f`, and `-E` in `sudo -E rm -rf /*`, as the command.
// So the reader now steps over three things, in a loop:
//   - a leading assignment, and the shell keywords that open a command (`then`, `do`, `!`, …);
//   - a WRAPPER, with its options: the table says which options take the next token as a value,
//     and how many positionals come before the command (timeout's DURATION);
//   - a RUNNER (`bash -c`, `sh -c`, `eval`, `xargs`). The string it runs is split on whitespace
//     with its quotes stripped, like every token here, so its first word is the command word. A
//     script path (`bash deploy.sh --force`) matches no rule, so `-c` needs no special case.
// `command -v git` names git and runs nothing, so it stops there.
//
// The table is not closed, and no table can be: the set of runners is open. So the DENY and ASK
// lists also look past the command word — see "THE BACKSTOP" at `decide`.
const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!"]);
const SH_OPTS = { value: ["-o", "-O", "--rcfile", "--init-file"] };
const WRAPPERS = new Map([
  ["sudo", { value: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t", "--user", "--group", "--host", "--prompt", "--close-from", "--chdir", "--chroot", "--command-timeout", "--other-user", "--role", "--type"] }],
  ["doas", { value: ["-u", "-C"] }],
  // Not `-S`: `env -S "git push -f"` splits its value into the command, so the value IS the command.
  ["env", { value: ["-u", "--unset", "-C", "--chdir"] }],
  ["command", { query: ["-v", "-V"] }],
  ["exec", { value: ["-a"] }],
  ["nohup", {}], ["builtin", {}], ["noglob", {}], ["time", {}], ["winpty", {}], ["eval", {}],
  ["nice", { value: ["-n", "--adjustment"] }],
  ["ionice", { value: ["-c", "-n", "-p", "-P", "-u", "--class", "--classdata"] }],
  ["timeout", { value: ["-s", "--signal", "-k", "--kill-after"], positional: 1 }],
  ["stdbuf", { value: ["-i", "-o", "-e", "--input", "--output", "--error"] }],
  ["xargs", { value: ["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter", "--eof", "--replace", "--max-lines", "--max-args", "--max-procs", "--max-chars", "--process-slot-var"] }],
  ["bash", SH_OPTS], ["sh", SH_OPTS], ["zsh", SH_OPTS], ["dash", SH_OPTS], ["ksh", SH_OPTS],
]);

/** The index just past one wrapper's options and positionals, starting at its first argument. */
function pastWrapper(tokens, i, w) {
  let positional = w.positional ?? 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "--") return i + 1 + positional;
    if (t.startsWith("-")) {
      i += w.value?.includes(t) ? 2 : 1;
    } else if (positional > 0) {
      positional--;
      i++;
    } else {
      return i;
    }
  }
  return i;
}

// ── HOW A COMMAND IS SPELLED (v12, blindly CF-6) ──
//
// On Windows, Git Bash finds `GIT`, `git.exe` and `Git.EXE` as /mingw64/bin/git.exe, and `rm.exe` as
// /usr/bin/rm.exe, and macOS's default filesystem ignores case too. Every rule compared the command
// word as typed, so `git.exe push --force origin main` and `rm.exe -rf /*` were ALLOWED by v11 and
// every version before it, measured by blindly on win32. So a word that might BE a command is read as
// the system finds it: its basename, lowercased, without `.exe`/`.cmd`/`.bat`/`.com`.
//
// ONLY WHERE THE GATE FINDS A COMMAND, NEVER WHERE IT EXCUSES ONE. The rules (`atCommand`), the
// wrapper table and the backstop's names use `commandName`; the lists that make a command's words
// text — prose, heredoc sinks, data commands — still match exactly. Normalising those would loosen:
// `ECHO` read as `echo` makes its words prose. So every verdict this changes gets stricter, and a
// spelling no list names is read as a command, which is the direction a gate fails.
//
// NOT COVERED: a settings twin matches the spelling it names, so `Bash(git push --force *)` is no
// floor for `git.exe push --force`. A project that wants one lists the spelling in its settings.
const EXECUTABLE_SUFFIX = /\.(?:exe|cmd|bat|com)$/;
const commandName = (t) => t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\")) + 1).toLowerCase().replace(EXECUTABLE_SUFFIX, "");

/** Index of the command word in a segment: past assignments, keywords, wrappers and runners. */
function commandWordIndex(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (KEYWORDS.has(t) || /^[A-Za-z_]\w*=/.test(t)) {
      i++;
      continue;
    }
    const w = WRAPPERS.get(commandName(t));
    if (!w || w.query?.includes(tokens[i + 1])) break;
    i = pastWrapper(tokens, i + 1, w);
  }
  return i < tokens.length ? i : -1;
}

/** Is `name` this segment's command — as `name`, `/usr/bin/name`, `\name`, `NAME.exe`, or after `sudo`? */
function atCommand(tokens, name) {
  const i = commandWordIndex(tokens);
  return i !== -1 && commandName(tokens[i]) === name.toLowerCase();
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
 * THREE WAYS A BODY IS NOT DATA, all measured by pleks as allowed by v6 (CF-9 ②), and each keeps
 * the body now:
 *   - `<<<` is a HERE-STRING. It feeds one word, and the lines after it are commands. The opener
 *     regex matched the last two of its three `<`.
 *   - `cat <<'EOF' | sh` pipes the body on. The receiver before `<<` is a sink, but the command after
 *     `|` runs the body, so every stage of the pipeline must be a sink.
 *   - An UNQUOTED delimiter's body is expanded, so `$(…)` and backticks in it run. Such a line is
 *     kept, and splitting makes the substitution a command position. A quoted body is literal.
 *
 * ONE PASS. Bare-identifier lines are indexed first, then each opener binary-searches
 * for its terminator — a scan-to-end per opener measured QUADRATIC (20k unterminated
 * openers: 4 s), and a hook that can be made to hang has failed at the one job it has.
 */
function isSink(segmentText) {
  const tokens = segmentText.split(/\s+/).map(normToken).filter(Boolean);
  const cw = commandWordIndex(tokens);
  return cw !== -1 && HEREDOC_SINKS.has(tokens[cw].replace(/^.*\//, ""));
}

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
    const m = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line);
    if (!m) return i;
    const before = line.slice(0, m.index);
    if (!isSink(before.split(/[;&|]+/).pop() ?? "")) return i;
    // The rest of the opener's pipeline: every stage after `|` must be a sink too, and a process
    // substitution runs a command of its own.
    const rest = line.slice(m.index + m[0].length);
    const pipeline = rest.split(/;|&&|\|\|/)[0];
    if (/[<>]\(/.test(rest) || pipeline.split(/\|&?/).slice(1).some((stage) => !isSink(stage))) return i;
    const j = firstAfter(bare.get(m[2]) ?? [], i);
    if (j === -1) return i; // unterminated: keep the body
    const literal = m[1] !== "";
    for (let k = i + 1; k < j; k++) out.push(literal || !/\$\(|`/.test(lines[k]) ? "" : lines[k]);
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
 * the point an attacker would choose. `$(`, backticks and the process substitutions
 * `<(` / `>(` open a segment too, so a substitution is a command position and not a
 * hiding place.
 *
 * `bare` says, per token, whether it stood OUTSIDE quotes. Only the backstop reads it: a
 * quoted word is an argument (`--body "never rm -rf /"`), and a bare one may be a command.
 *
 * `unknowable` (v13, pleks CF-18) marks a segment whose LAST WORD is a whole substitution — `rm -rf
 * $(echo ~)`, `` rm -rf `x` `` — which splitting cut off, so the segment's rule saw no target. What a
 * substitution prints is not in the command. Only the rm rule reads it. `$(pwd)/build` is not whole:
 * a named path follows, as `~/projects` is not `~`.
 */
function segments(command) {
  const src = maskSinkHeredocs(command).replace(/\\\r?\n/g, " ");
  const quoted = quoteMap(src);
  const out = [];
  const piece = (from, to, unknowable) => {
    const tokens = [];
    const bare = [];
    for (const m of src.slice(from, to).matchAll(/\S+/g)) {
      const t = normToken(m[0]);
      if (!t) continue;
      tokens.push(t);
      bare.push(quoted[from + m.index] === 0);
    }
    if (tokens.length === 0) return;
    const seg = { text: src.slice(from, to).trim(), tokens, bare, unknowable };
    const w = shellWords(from, to);
    // v15 (blindly CF-10): element by element. v14 compared counts, and `" "` — one word, no token —
    // cancelled a quoted path's split, so `"…/git.exe" push --force origin main # " "` read as v13 did.
    if (w.tokens.length !== tokens.length || w.tokens.some((t, k) => t !== tokens[k])) seg.words = w;
    out.push(seg);
  };
  // v14 (blindly CF-8): the segment's WORDS as bash splits them, at unquoted whitespace only.
  const shellWords = (from, to) => {
    const w = { tokens: [], bare: [] };
    let start = -1;
    for (let i = from; i <= to; i++) {
      const gap = i === to || (quoted[i] === 0 && isSpace(src[i]));
      if (!gap && start === -1) start = i;
      else if (gap && start !== -1) {
        const t = normToken(src.slice(start, i));
        if (t) {
          w.tokens.push(t);
          w.bare.push(quoted[start] === 0);
        }
        start = -1;
      }
    }
    return w;
  };
  const plain = plainQuoting(src, quoted);
  const whole = substitutedWords(src);
  let from = 0;
  for (const sep of src.matchAll(/[;&|\n]+|\$\(|[<>]\(|`/g)) {
    if (plain && quoted[sep.index] !== 0 && leadsData(src.slice(from, sep.index))) continue;
    piece(from, sep.index, whole(sep));
    from = sep.index + sep[0].length;
  }
  piece(from, src.length, false);
  return out;
}

/**
 * Given a separator match, is it the opening of a substitution that is a WHOLE word: after a space
 * (or a `"` after one), and closed before a space, a separator or the end? Every `(` is paired once,
 * in one pass, on first need: a scan to the close per `$(` is quadratic in nested openers.
 */
function substitutedWords(src) {
  let close = null;
  const startsWord = (i) => {
    const b = src[i - 1] === '"' ? i - 2 : i - 1;
    return b < 0 || isSpace(src[b]);
  };
  const endsWord = (end) => {
    const e = src[end] === '"' ? end + 1 : end;
    return e >= src.length || /[\s;&|)]/.test(src[e]);
  };
  return (sep) => {
    const i = sep.index;
    // A closing backtick is read as an opening one too. It ends the substitution's OWN text, so the
    // flag lands on a piece that is the substitution — harmless unless that is itself a recursive rm.
    if (sep[0] === "`") {
      if (!startsWord(i)) return false;
      const end = src.indexOf("`", i + 1);
      return end !== -1 && endsWord(end + 1);
    }
    if (sep[0] !== "$(" || !startsWord(i)) return false;
    if (close === null) {
      close = new Int32Array(src.length).fill(-1);
      const open = [];
      for (let j = 0; j < src.length; j++) {
        if (src[j] === "(") open.push(j);
        else if (src[j] === ")" && open.length) close[open.pop()] = j;
      }
    }
    return close[i + 1] !== -1 && endsWord(close[i + 1] + 1);
  };
}

/**
 * A QUOTED SEPARATOR IS TEXT — BUT ONLY WHERE THAT IS PROVABLE (v10).
 *
 * Until v10 every `;`, `&`, `|` and newline split a segment, quoted or not, so
 * `grep -E "x|npm install|y" f` read as a command `npm install` and was denied: a gate that refuses
 * a search for the rule it enforces. Measured in dev-standards, three refusals in one session.
 *
 * Splitting blindly was not only a bug, though: it is what catches a SECOND command inside a
 * runner's string. `bash -c "echo hi; rm -rf /*"` reads its command word as `echo`, and the
 * `rm` is denied only because the quoted `;` splits it off. The same holds for `ssh host "…"`,
 * `watch "…"`, and every command that runs a string — an open set. So a quoted separator stays a
 * split everywhere EXCEPT both of:
 *   - the segment is led, as its very first word, by a command whose arguments are data and never
 *     run (`DATA_ARGS`): no wrapper, no runner, no assignment in front of it;
 *   - this file's quote map pairs the command exactly as bash does. It cannot when a substitution
 *     opens a fresh quoting context (`"$(echo "a" ; rm …)"` re-pairs every quote after it), inside
 *     `$'…'`, across a heredoc, when a quote never closes, or when a quoted span holds a newline —
 *     which is also the only way an apostrophe in a `# comment` can mis-pair, since a comment ends
 *     at its newline. Any of those, and the whole command splits exactly as v9 did.
 * Wrong in either direction, the cost differs: a split too many is a false deny, one too few is a
 * hidden command. So the list is short and closed, and unsure means v9.
 *
 * WHAT IT DOES NOT FIX. `gh pr create --title "a; npm i b" --body "$(cat <<'EOF' … )"` still splits
 * at the title's `;` — the command holds a substitution, and `gh` runs strings (`gh codespace ssh`),
 * so neither condition holds. Write such a body with `--body-file` and the title without a
 * separator, or commit with `-F <file>`. Proving a masked substitution inert is a larger change.
 */
const DATA_ARGS = new Set(["grep", "egrep", "fgrep", "rg", "echo", "printf"]);

function plainQuoting(src, q) {
  if (q.open || /\$\(|`|<<|\$'/.test(src)) return false;
  for (let i = 0; i < src.length; i++) {
    if (q[i] !== 0 && src[i] === "\n") return false;
    // Data piped on is data only if what receives it reads stdin as data: `echo "a; rm -rf /" | sh`.
    if (q[i] === 0 && src[i] === "|" && src[i - 1] !== "|") {
      if (src[i + 1] === "|") continue;
      const stage = /^&?\s*(\S+)/.exec(src.slice(i + 1))?.[1] ?? "";
      if (!HEREDOC_SINKS.has(stage)) return false;
    }
  }
  return true;
}

function leadsData(text) {
  const first = /\S+/.exec(text)?.[0] ?? "";
  return !/["'\\]/.test(first) && DATA_ARGS.has(first);
}

/**
 * For each character inside quotes (or a quote itself) 1 if single, 2 if double, else 0. Bash's
 * rules: nothing escapes in single quotes; in double quotes `\` escapes the next character; outside,
 * `\` quotes one. `.open` is true when the string ends inside a quote.
 */
function quoteMap(s) {
  const q = new Uint8Array(s.length);
  let state = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const mark = c === '"' || state === '"' ? 2 : 1;
    if (state === "") {
      if (c === "\\") i++;
      else if (c === "'" || c === '"') {
        state = c;
        q[i] = mark;
      }
    } else {
      q[i] = mark;
      if (state === '"' && c === "\\" && i + 1 < s.length) q[++i] = mark;
      else if (c === state) state = "";
    }
  }
  q.open = state !== "";
  return q;
}

/**
 * Blank the TEXT of a `-m`/`--message` value, quotes left in place, before scanning
 * for FLAGS. The message is git's argument, not a switch — denying `git commit -m
 * "we ban --no-verify"` means the gate forbids writing down the rule it enforces.
 * NOT "strip quotes": `git commit "--no-verify"` IS the flag once the shell strips
 * the quotes, and `normToken` treats it so. Only the value of `-m` is inert.
 *
 * A backslash escapes only inside DOUBLE quotes. v6 honoured it inside single quotes too, so
 * `echo -m 'a\' && rm -rf /* && echo 'b'` masked everything up to the last `'` (pleks CF-9 ③).
 *
 * THE FLAG IS `-m` WHEREVER GIT READS ONE (v8, yoros CF-11). Until v8 only a standalone `-m` counted,
 * so `git commit -am "never use --no-verify"`, the commonest way a commit is typed, was denied for
 * its own message. Now a short cluster whose LAST letter is `m` counts too (`-am`, `-qm`), and so
 * does a value attached by a quote (`-m"…"`, `--message="…"`). Not when a letter before the `m`
 * takes a value: in `-Fm` the `m` is F's file, so a quoted `"--no-verify"` after it is the flag.
 */
const isSpace = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";

/** The length of a message flag starting at `i` (`-m`, `-am`, `--message`), or 0. */
function messageFlagAt(command, i) {
  if (command[i] !== "-" || (i > 0 && !isSpace(command[i - 1]))) return 0;
  if (command.startsWith("--message", i)) return 9;
  let j = i + 1;
  while (j < command.length && /[A-Za-z]/.test(command[j])) j++;
  const cluster = command.slice(i + 1, j);
  if (!cluster.endsWith("m") || [...cluster.slice(0, -1)].some((c) => "mFcCtuS".includes(c))) return 0;
  return j - i;
}

function maskMessageText(command) {
  const quoted = quoteMap(command);
  // A double-quoted message still runs its `$(…)` and backticks, and where a substitution inside
  // quotes ends is the shell's to say, not this scan's. So where one is double-quoted, nothing is
  // masked, and every flag rule reads the whole command. Until v8 `git commit -m "$(git push -f)"`
  // passed. In single quotes it is text, and `-m '$(…)'` is masked as before.
  for (let p = 0; p < command.length; p++) {
    if (quoted[p] === 2 && (command[p] === "`" || (command[p] === "$" && command[p + 1] === "("))) return command;
  }
  const out = command.split("");
  let i = 0;
  while (i < command.length) {
    // Only an UNQUOTED `-m` is a flag: in `echo " -m '" && …` it is text, and v7 masked from its
    // quote to the next one, over the command between.
    const flagLen = quoted[i] ? 0 : messageFlagAt(command, i);
    const after = command[i + flagLen];
    const spaced = after === undefined || isSpace(after);
    const attached = after === '"' || after === "'" || (after === "=" && command[i + 1] === "-");
    if (flagLen === 0 || !(spaced || attached)) {
      i++;
      continue;
    }
    let k = i + flagLen + (after === "=" ? 1 : 0);
    while (spaced && k < command.length && isSpace(command[k])) k++;
    const quote = command[k];
    if (quote !== '"' && quote !== "'") {
      i = k > i ? k : i + 1;
      continue;
    }
    let end = k + 1;
    while (end < command.length && command[end] !== quote) {
      if (quote === '"' && command[end] === "\\") end++;
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

// v13 (pleks CF-18): a recursive rm whose target is a whole substitution (`segments`' `unknowable`).
// The target is printed at run time, so it cannot be shown not to be a root — and `rm -rf $(echo ~)`
// was allowed because splitting left the rm with no target at all.
// Before the first r or R, letters other than those, as SHORT_CLUSTER_WITH_F: one way to match.
const RECURSIVE = /^(?:-[A-QS-Za-qs-z]*[rR][A-Za-z]*|--recursive)$/;

function isDestructiveRm(tokens, _text, _command, ctx) {
  if (!atCommand(tokens, "rm")) return false;
  const args = argsOf(tokens);
  return args.some((t) => LETHAL_TARGET.test(t)) || (ctx?.unknowable === true && args.some((t) => RECURSIVE.test(t)));
}

/**
 * Git accepts any unambiguous prefix of a long option, so `--no-veri` IS `--no-verify` and `--har` IS
 * `--hard` (pleks CF-9, observed). `min` is the shortest prefix that names only `full` for the verbs
 * it is used with; a shorter one is ambiguous, and git refuses it.
 */
const spells = (t, full, min) => t.length >= min.length && t.startsWith(min) && full.startsWith(t);

/**
 * `git … push … --force|-f|-xf`, or `--mirror`, which force-updates and deletes every remote ref to
 * match the local ones. `--force-with-lease` and `--force-if-includes` are the SAFE forms and pass.
 */
function isForcePush(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  if (!args.includes("push")) return false;
  return args.some((t) => FORCE_LONG.test(t) || SHORT_CLUSTER_WITH_F.test(t) || spells(t, "--mirror", "--mi"));
}

/**
 * `-n` inside a short cluster, read the way git reads one: letters until one that takes a value, whose
 * value is the rest (`-am x` is all + message; `-mn` is the message "n"; `-an` is all + no-verify).
 */
function clusterHasN(t) {
  if (!/^-[A-Za-z]+$/.test(t)) return false;
  for (const c of t.slice(1)) {
    if (c === "n") return true;
    if ("mFcCtuS".includes(c)) return false;
  }
  return false;
}

/**
 * `--no-verify` on the hooked verbs, `-c core.hooksPath=…` (which points every hook elsewhere), and
 * `-n` only on COMMIT. On push `-n` is `--dry-run`, and push's --no-verify has no short form (git
 * 2.55 `push -h`): v6 denied a dry-run push as if it skipped the gate (yoros CF-10 (b)).
 */
function isNoVerify(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  const verb = args.find((t) => ["commit", "push", "merge", "revert", "cherry-pick"].includes(t));
  if (!verb) return false;
  if (args.some((t) => spells(t, "--no-verify", "--no-veri"))) return true;
  if (args.some((t, i) => t === "-c" && /^core\.hookspath=/i.test(args[i + 1] ?? ""))) return true;
  return verb === "commit" && args.some(clusterHasN);
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

/** The branch checked out when segment `index` runs: `head`, moved by every segment before it. */
function branchBefore(plan, index, head, root) {
  let current = head;
  for (let i = 0; i < index; i++) current = branchStep(plan[i], current, root);
  return current;
}

function branchStep(s, current, root) {
  if (s.kind === "git") return branchAfter(s.args, current);
  if (s.kind === "cd") return branchAfterCd(s.args.find((t) => !t.startsWith("-")), current, root);
  if (s.kind === "popd") return UNKNOWN;
  return current;
}

/**
 * Does segment `index` merge, pull or push into the protected branch? `plan` is every segment as
 * `{ kind: "git" | "cd" | "popd" | "other", args }`; the segments before `index` say which branch is
 * checked out when this one runs.
 */
function reachesProtected(plan, index, { protectedBranch, head, root, before }) {
  // `before`, when given, is the branch checked out before each segment, computed once per command
  // (v9, pleks CF-17): replaying the prefix per git segment was quadratic in the segment count.
  const current = before ? before(index) : branchBefore(plan, index, head, root);
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
  // NAMED: a PUSH naming the branch as its destination. Until v7 a merge naming it asked too, but a
  // merge's argument is its SOURCE: `git merge main` brings main into the branch you are on, and
  // whether THAT is the protected branch is the BY REFERENCE question below (pleks CF-8).
  if (args.includes("push") &&
    args.some((t) => t === b || t === `origin/${b}` || t === `refs/heads/${b}` || t.endsWith(`:${b}`))) return true;
  // BY REFERENCE: everything else that lands there.
  if (!ctx) return false;
  return reachesProtected(ctx.plan, ctx.index, { protectedBranch: b, head: headBranch(), root: process.env.CLAUDE_PROJECT_DIR || null, before: ctx.before });
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
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  return args.includes("reset") && args.some((t) => spells(t, "--hard", "--ha"));
}

function isForceClean(tokens) {
  if (!atCommand(tokens, "git")) return false;
  const args = argsOf(tokens);
  return args.includes("clean") && args.some((t) => spells(t, "--force", "--f") || SHORT_CLUSTER_WITH_F.test(t));
}

const CANON_DENY = [
  [isDestructiveRm, "rm aimed at a filesystem root or home directory, or recursively at a substitution that could print one"],
  [isForcePush, "force-push without --force-with-lease (--mirror is one)"],
  [isForceRefspec, "a +refspec force-pushes that ref — push without the +, or use --force-with-lease"],
  [isNoVerify, "--no-verify (or -n on commit, or core.hooksPath) skips the project's own gate"],
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

// ── THE BACKSTOP (v7, pleks CF-9 ①) ──
//
// The wrapper table cannot be complete, because the set of commands that run another command is
// open: `winpty git push -f`, `find / -exec rm -rf / \;`, and the next runner nobody has listed.
// pleks's argument, and canon takes it: a gate must fail toward the gate. So after the command word,
// every BARE token naming a command canon's rules key on (`git`, `rm`, `gh`) is tried as a command
// word too, by every deny and ask rule.
//
// Three limits keep the gate from being a wall, which is v2's harvest and still the posture:
//   - A QUOTED token is an argument, never a command: `gh pr create --body "never rm -rf /"`.
//     A runner's quoted string is reached by the wrapper table (`bash -c "…"`), not by this.
//   - A PROSE command's words are text, never run: `echo git push -f`, `grep -rn "rm -rf /" .`.
//   - A bare `#` starts a comment, and nothing after it runs.
// NOT COVERED: a project rule keyed on some other command gets the wrapper table, not this; and a
// command a runner sends elsewhere in quotes (`ssh host "rm -rf /"`), which runs on another machine.
const GATED_NAMES = new Set(["git", "rm", "gh"]);
const PROSE = new Set(["echo", "printf", "grep", "egrep", "fgrep", "rg", "ag", "man", "help", "info", "whatis", "apropos", "which", "type", "whereis", ":", "true", "false"]);

/**
 * Each later command position the backstop tries in one segment, as that position's segment, and the
 * tokens they span. Stops copying once the span passes `budget`, and says so with `over` — a copy per
 * position is the O(n·k) that exhausted v8's heap.
 */
function laterPositions(seg, budget) {
  const cw = commandWordIndex(seg.tokens);
  const out = { positions: [], span: 0, over: false };
  const take = (tokens, bare = tokens.map(() => true)) => {
    out.span += tokens.length;
    if (out.span > budget) out.over = true;
    else out.positions.push({ ...seg, tokens, bare });
    return !out.over;
  };
  const prose = cw !== -1 && PROSE.has(seg.tokens[cw].replace(/^.*\//, ""));
  for (const run of envStrings(seg, prose ? cw : seg.tokens.length)) if (!take(run)) return out;
  if (cw === -1 || prose) return out;
  const gitStrings = (g) => [...configStrings(seg, g), ...extStrings(seg, g)];
  if (isGit(seg.tokens[cw])) for (const run of gitStrings(cw)) if (!take(run)) return out;
  for (let i = cw + 1; i < seg.tokens.length; i++) {
    if (!seg.bare[i]) continue;
    if (seg.tokens[i].startsWith("#")) break;
    if (!GATED_NAMES.has(commandName(seg.tokens[i]))) continue;
    if (!take(seg.tokens.slice(i), seg.bare.slice(i))) break;
    if (isGit(seg.tokens[i])) for (const run of gitStrings(i)) if (!take(run)) return out;
  }
  return out;
}

// ── A STRING GIT RUNS IS A COMMAND (v11, blindly G-10, walk 02) ──
//
// `git -c alias.q="!rm -rf /*" q` runs `rm -rf /*`, and v10 allowed it: the value is one quoted
// argument of git, so no rule reads it at command position. The same holds for every config key
// whose value git runs — `core.pager`, `core.sshCommand`, `core.editor`, `diff.external`, … — and
// for the environment that sets them (`GIT_SSH_COMMAND`, `GIT_PAGER`, `EDITOR`, `GIT_CONFIG_VALUE_0`).
// Found by blindly's own walk of its DB-ask gate, which had exempted git as a search.
//
// Which keys run code is an open set, so this does not list them. EVERY value set through `-c`,
// `git config <key> <value>` or a git-read variable is tried as a command position by every rule,
// exactly as the backstop tries a bare `rm`. An inert value (`color.ui=always`, `user.name=x`) names
// no gated command and passes; a lethal one is denied whatever key carries it. Two spellings:
//   - a `!` value is a shell command, and git appends the alias's arguments to it, so the rest of
//     the segment goes on the end (`git -c alias.q='!rm -rf' q /` runs `rm -rf /`);
//   - an `alias.*` value without `!` is git arguments, so it is read behind a `git`
//     (`-c alias.p="push --force" p` is a force-push).
// A value runs to the last token that began inside quotes, because the tokens keep no quotes.
//
// v12 (blindly CF-7) closes three neighbours v11 missed:
//   - an assignment BEHIND a wrapper (`sudo GIT_SSH_COMMAND='rm -rf /*' git fetch`, `env -i …`):
//     every assignment in the segment is read, not only a leading one — except after a prose
//     command, whose words are text;
//   - variables git honours that are not `GIT_`-prefixed: `SSH_ASKPASS`, and the `LESSOPEN` /
//     `LESSCLOSE` preprocessors of the default pager;
//   - the `ext::` transport, which runs its URL as a command (`fetch 'ext::sh -c rm% -rf% /*'`);
//     `% ` is its escaped space, so a trailing `%` is dropped from each word.
// NOT COVERED: `--config-env=<key>=<VAR>` and an `include.path` file (the value is not in the
// command), a `GIT_CONFIG_PARAMETERS` string (its own quoting), an alias already in a config
// file — `git q` names nothing — and a value computed by a substitution (`GIT_SSH_COMMAND="$(…)"`):
// the substitution is a segment of its own, read as the command that PRINTS the value, and `echo`
// prints. A `git config` that WRITES one is read here, which is where it is seen.
const GIT_RUNS_ENV = /^(?:GIT_\w+|EDITOR|VISUAL|PAGER|SSH_ASKPASS|LESSOPEN|LESSCLOSE)=/;
const CONFIG_WITH_VALUE = new Set(["-f", "--file", "--blob", "--type", "--default", "--comment", "--value"]);
const isGit = (t) => commandName(t) === "git";

/** The tokens of a value that starts after the `=` of token `i` (or at `i`), and the index past it. */
function valueAt(seg, i, afterEq) {
  const t = seg.tokens[i];
  const head = afterEq ? t.slice(t.indexOf("=") + 1) : t;
  let j = i + 1;
  while (j < seg.tokens.length && !seg.bare[j]) j++;
  return { value: [head, ...seg.tokens.slice(i + 1, j)].filter(Boolean), end: j };
}

/** A config value as the command it runs: a shell command after `!`, git arguments for an alias. */
function asCommand(key, value, rest) {
  if (value.length === 0) return null;
  const [head, ...more] = value;
  if (head.startsWith("!")) return [head.slice(1), ...more, ...rest].filter(Boolean);
  return /^alias\./i.test(key) ? ["git", ...value, ...rest] : value;
}

/** Each unquoted `GIT_*=`, `EDITOR=`, … assignment's value in a segment, before index `upTo`. */
function envStrings(seg, upTo) {
  const runs = [];
  let i = 0;
  while (i < upTo) {
    if (!seg.bare[i] || !GIT_RUNS_ENV.test(seg.tokens[i])) {
      i++;
      continue;
    }
    const { value, end } = valueAt(seg, i, true);
    const run = asCommand("", value, []);
    if (run) runs.push(run);
    i = end;
  }
  return runs;
}

/** Each `ext::<command>` URL the `git` at index `g` is given, as the command it runs. */
function extStrings(seg, g) {
  const runs = [];
  for (let i = g + 1; i < seg.tokens.length; i++) {
    if (!/^ext::/i.test(seg.tokens[i])) continue;
    const { value } = valueAt(seg, i, false);
    const run = [value[0].slice(5), ...value.slice(1)].map((t) => t.replace(/%$/, "")).filter(Boolean);
    if (run.length) runs.push(run);
  }
  return runs;
}

/** Each config value the `git` at index `g` is given: global `-c k=v`, and `git config k v`. */
function configStrings(seg, g) {
  const { tokens } = seg;
  const runs = [];
  let i = g + 1;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    if (tokens[i] === "-c" && i + 1 < tokens.length && tokens[i + 1].includes("=")) {
      const { value, end } = valueAt(seg, i + 1, true);
      const run = asCommand(tokens[i + 1].slice(0, tokens[i + 1].indexOf("=")), value, tokens.slice(end));
      if (run) runs.push(run);
      i = end;
    } else {
      i += GLOBAL_WITH_VALUE.has(tokens[i]) ? 2 : 1;
    }
  }
  if (tokens[i] !== "config") return runs;
  for (i++; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      if (CONFIG_WITH_VALUE.has(t)) i++;
      continue;
    }
    if (t === "set" || t === "--add") continue;
    if (/^[A-Za-z][\w-]*\.\S+$/.test(t)) {
      const run = asCommand(t, tokens.slice(i + 1), []);
      if (run) runs.push(run);
    }
    break;
  }
  return runs;
}

// ── WHAT CONSUMES TEXT DECIDES WHETHER IT IS TEXT (v13, pleks CF-18) ──
//
// Every earlier version decided that quoted text, an echo's arguments and a heredoc's body were
// PROSE from the token that held them. Measured by pleks and reproduced in canon against v12: every
// bare act was gated, and every one of these was ALLOWED —
//
//   echo 'rm -rf ~' | bash          sh <<< 'rm -rf ~'            pwsh -c "git push -f origin x"
//   cmd.exe /c "git push -f …"      python -c "import os; os.system('git reset --hard')"
//   perl -e 'system("git push -f …")'   awk 'BEGIN{system("…")}'   sed -n '1e git push -f …' x.txt
//   node - <<'EOF' … execSync('git reset --hard') … EOF          sed -f - / awk -f - <<'EOF' … EOF
//
// Text is prose until something RUNS it, and what runs it is a different token: a pipe into an
// interpreter, a here-string or heredoc into one, an interpreter's code argument, or a sink that is
// secretly an interpreter (sed's `e`, awk's `system(`). So the command is read a second time, as
// shell WORDS rather than tokens — quotes removed the way bash removes them, a heredoc's body kept
// with the command that receives it — and each string an interpreter is given goes back through
// every rule as a command of its own:
//   - a SHELL (`sh`, `bash`, …) or a WINDOWS shell (`pwsh`, `cmd`) runs its stdin, its here-string,
//     and its `-c` / `-Command` / `/c` string as shell;
//   - a CODE interpreter (`python`, `node`, `perl`, `ruby`, …) is given code, and code reaches a
//     shell through a string: every quoted literal in its arguments and its stdin is read as a
//     command, and so are all of them joined, which is `execFileSync('git', ['push', '-f'])`;
//   - `sed` runs its `e` command and an `s///e` replacement; `awk` runs the literals of a program
//     holding `system(` or a `|`. Both read their program from stdin under `-f -`. Without those,
//     sed and awk stay the heredoc sinks they were, and `awk '{print "rm -rf /"}'` is still prose.
// Stdin is what the command's own here-strings and heredocs give it, and what every earlier stage
// of its pipeline was given. A string read so is read again, to CONSUMED_DEPTH, so `bash -c "echo
// '…' | sh"` is seen. Every change is stricter: a string is ADDED to what the rules read, never
// taken away, and what a prose command is given stays prose until something consumes it — `echo
// 'rm -rf ~'`, `| cat` and `| grep` still pass.
//
// THE COST, declared: a code interpreter that only PRINTS a string naming a gated act (`node -e
// "console.log('git push -f')"`) is denied as if it ran it. A literal cannot be told from a command
// without reading the language, and unknown fails toward the gate.
//
// NOT COVERED: a string built at run time (a variable, `q{…}`, base64, `-EncodedCommand`, a
// concatenation of words that are not each a literal); a file an interpreter or `sed -f` reads;
// sed's bare `e`, which runs the pattern space; an interpreter's own deletion API
// (`shutil.rmtree('/')`, `fs.rmSync`), which names no command; and `xargs` composing piped words
// into another command's ARGUMENTS (`echo ~ | xargs rm -rf`) — reading those as a target would deny
// `find / -name x | xargs rm -f`, since rm's targets are then find's arguments.
const CONSUMED_DEPTH = 3;
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const WINDOWS_SHELLS = new Set(["pwsh", "powershell", "cmd"]);
const CODE = /^(?:python[\d.]*|py|node|nodejs|deno|bun|perl|ruby|php)$/;

function interpreterKind(name) {
  if (SHELLS.has(name)) return "shell";
  if (WINDOWS_SHELLS.has(name)) return "windows";
  if (CODE.test(name)) return "code";
  if (/^g?sed$/.test(name)) return "sed";
  if (/^[gmn]?awk$/.test(name)) return "awk";
  return null;
}

/** The command a list of words runs, as `commandWordIndex` finds it — but stopping AT a shell. */
function commandAt(words) {
  let i = 0;
  while (i < words.length) {
    const t = words[i];
    if (KEYWORDS.has(t) || /^[A-Za-z_]\w*=/.test(t)) {
      i++;
      continue;
    }
    const name = commandName(t);
    if (interpreterKind(name)) return { name, i };
    const w = WRAPPERS.get(name);
    if (!w || w.query?.includes(words[i + 1])) return { name, i };
    i = pastWrapper(words, i + 1, w);
  }
  return null;
}

/**
 * A command string as shell COMMANDS of WORDS: `{ words, stdin, pipe }`, `pipe` when `|` follows it.
 * Quotes come off the way bash takes them (nothing escapes in `'…'`; `$'…'` decodes `\n`); a
 * substitution stays inside its word, unread; a here-string and each heredoc's body go to `stdin`
 * of the command that opened them. Approximate, and only additive: what it misreads is a string the
 * rules read in vain, or one they miss — never one the token reading above loses. One pass.
 */
function lexCommands(src) {
  const cmds = [];
  const fresh = () => ({ words: [], stdin: [], pipe: false });
  let cur = fresh();
  let word = null;
  let hereString = false;
  let heredocs = [];
  const add = (s) => {
    word = (word ?? "") + s;
  };
  const endWord = () => {
    if (word === null) return;
    (hereString ? cur.stdin : cur.words).push(word);
    hereString = false;
    word = null;
  };
  const endCommand = (pipe) => {
    endWord();
    hereString = false;
    if (cur.words.length > 0 || cur.stdin.length > 0) {
      cur.pipe = pipe;
      cmds.push(cur);
      cur = fresh();
    } else if (pipe && cmds.length > 0) cmds[cmds.length - 1].pipe = true; // `(echo x) | sh`
  };
  // The index just past a `(…)` that opens at `i`, quotes inside it respected.
  const balanced = (i) => {
    let depth = 0;
    let q = "";
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (q) {
        if (c === "\\" && q !== "'") j++;
        else if (c === q) q = "";
      } else if (c === "\\") j++;
      else if (c === "'" || c === '"' || c === "`") q = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return j + 1;
    }
    return src.length;
  };
  // `&>`, `2>&1`: a redirection, not a separator — it stays in the word.
  const redirects = (i) => src[i + 1] === ">" || src[i - 1] === ">" || src[i - 1] === "<";
  const pastTick = (i) => {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") j += src[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, src.length);
  };
  const opener = (j) => {
    const strip = src[j] === "-";
    if (strip) j++;
    while (src[j] === " " || src[j] === "\t") j++;
    let delim = "";
    for (; j < src.length && !/[\s;&|<>()]/.test(src[j]); j++) if (!"'\"\\".includes(src[j])) delim += src[j];
    if (delim) heredocs.push({ cmd: cur, delim, strip });
    return j;
  };
  const bodies = (j) => {
    for (const h of heredocs) {
      const lines = [];
      while (j < src.length) {
        let e = src.indexOf("\n", j);
        if (e === -1) e = src.length;
        const line = src.slice(j, e).replace(/\r$/, "");
        j = e + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        lines.push(line);
      }
      h.cmd.stdin.push(lines.join("\n"));
    }
    heredocs = [];
    return j;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "'") {
      let e = src.indexOf("'", i + 1);
      if (e === -1) e = src.length;
      add(src.slice(i + 1, e));
      i = e + 1;
    } else if (c === "$" && n === "'") {
      let j = i + 2;
      let s = "";
      for (; j < src.length && src[j] !== "'"; j++) {
        if (src[j] === "\\" && j + 1 < src.length) s += { n: "\n", t: "\t" }[src[++j]] ?? src[j];
        else s += src[j];
      }
      add(s);
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += "$`\"\\".includes(src[j + 1]) ? src[j + 1] : src.slice(j, j + 2);
          j += 2;
        } else s += src[j++];
      }
      add(s);
      i = j + 1;
    } else if (c === "\\") {
      add(n ?? "");
      i += 2;
    } else if (c === "`") {
      const e = pastTick(i);
      add(src.slice(i, e));
      i = e;
    } else if ((c === "$" || c === "<" || c === ">") && n === "(") {
      const e = balanced(i + 1);
      add(src.slice(i, e));
      i = e;
    } else if (c === "#" && word === null) {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i++;
    } else if (c === "\n") {
      endCommand(false);
      i = bodies(i + 1);
    } else if (c === ";" || c === "(" || c === ")" || (c === "&" && !redirects(i))) {
      endCommand(false);
      i++;
    } else if (c === "|") {
      endCommand(n !== "|");
      i += n === "|" || n === "&" ? 2 : 1;
    } else if (c === "<" && src.startsWith("<<<", i)) {
      endWord();
      hereString = true;
      i += 3;
    } else if (c === "<" && n === "<") {
      endWord();
      i = opener(i + 2);
    } else {
      add(c);
      i++;
    }
  }
  endCommand(false);
  return cmds;
}

/** What a pipeline stage writes on, approximately: the words it is given, and its own stdin. */
function givenTo(cmd) {
  const cw = commandWordIndex(cmd.words);
  const args = cw === -1 ? [] : cmd.words.slice(cw + 1);
  // `printf 'a\nb'` writes two lines, and so does `echo -e`; reading `\n` as a newline always is
  // the stricter error.
  return [args.join(" ").replace(/\\n/g, "\n"), ...cmd.stdin];
}

// A quoted literal in code: '…', "…" or `…`, each with backslash escapes. No nesting, so no backtracking.
const LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** Every quoted literal in a piece of code, unescaped — and, if several, all of them joined. */
function literals(code) {
  const found = [...code.matchAll(LITERAL)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\n/g, "\n").replace(/\\(.)/g, "$1"));
  return found.length > 1 ? [...found, found.join(" ")] : found;
}

/** `-c STRING` for a shell, as a cluster too (`-lc`, `-ec`): the string, or null. */
function shellString(args) {
  const i = args.findIndex((t) => /^-[A-Za-z]*c$/.test(t));
  return i === -1 || i + 1 >= args.length ? null : args[i + 1];
}

/** pwsh's `-Command` and every prefix of it down to `-c`, and cmd's `/c`, `/k`, `/r`. */
// v17 (pleks CF-21): `//c` too — Git Bash rewrites a lone `/c` as a path, so `cmd //c` is how it is typed there.
const windowsRun = (t) => /^\/{1,2}[ckr]$/i.test(t) || (t.length >= 2 && "-command".startsWith(t.toLowerCase()));

/**
 * A sed or awk program, from its words: each `-e`/`--expression`/`--source` value, stdin under
 * `-f -`, else the first word that is not an option. `flag` says which options take the program;
 * `valued` are the others that take the next word. `stdin` is a function, called only under `-f -`.
 */
function programs(args, stdin, flag, valued) {
  const out = { programs: [], fromStdin: false };
  let explicit = false;
  let first = null;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    const long = /^--(expression|source|file)(?:=([\s\S]*))?$/.exec(t);
    if (long || flag.test(t)) {
      explicit = true;
      const v = long?.[2] ?? args[++i] ?? "";
      const file = long ? long[1] === "file" : t.endsWith("f");
      if (!file) out.programs.push(v);
      else if ((v === "-" || v === "/dev/stdin") && !out.fromStdin) {
        out.fromStdin = true;
        out.programs.push(...stdin());
      }
    } else if (valued.has(t)) i++;
    else if (!t.startsWith("-") && first === null) first = t;
  }
  if (!explicit && first !== null) out.programs.push(first);
  return out;
}

// sed: an `e command` after an optional address, to the end of its line; and an `s///e` replacement.
const SED_ADDRESS = String.raw`(?:\d+(?:~\d+)?|\$|\/(?:[^\/\\\n]|\\.)*\/[IM]*)`;
const SED_E = new RegExp(String.raw`(?:^|[;{}\n])[ \t]*(?:${SED_ADDRESS}(?:[ \t]*,[ \t]*${SED_ADDRESS})?[ \t]*)?(?:![ \t]*)?e[ \t]+([^\n]+)`, "g");

/**
 * The replacement of every `s` command whose flags include `e`. A scan, not one regex: the delimiter
 * is whatever follows the `s`, and the regex that said so failed pleks's sonarjs/regex-complexity.
 * Every `s` is tried as a start, as a global regex tries every position, and a part ends at its line.
 */
function sedSubstituteE(program) {
  const out = [];
  for (let i = program.indexOf("s"); i !== -1; i = program.indexOf("s", i + 1)) {
    const d = program[i + 1];
    if (d === undefined || d === "\\" || d === "\n") continue;
    const parts = [];
    let part = "";
    let j = i + 2;
    for (; j < program.length && program[j] !== "\n" && parts.length < 2; j++) {
      if (program[j] === "\\" && j + 1 < program.length) part += program[j] + program[++j];
      else if (program[j] === d) {
        parts.push(part);
        part = "";
      } else part += program[j];
    }
    if (parts.length === 2 && /^[gpiImMw\d]*e/.test(program.slice(j))) out.push(parts[1]);
  }
  return out;
}

function sedRuns(program) {
  return [...[...program.matchAll(SED_E)].map((m) => m[1]), ...sedSubstituteE(program)];
}

// awk runs a command through `system(…)`, `print … | "cmd"` and `"cmd" | getline`.
const AWK_RUNS = /\bsystem\s*\(|\|/;
const SED_VALUED = new Set(["-l", "--line-length"]);
const AWK_VALUED = new Set(["-F", "-v", "--field-separator", "--assign", "-i", "--include", "-l", "--load"]);

// ── WHAT A COMMAND RUNS THAT IT NEVER QUOTED (v16, pleks's v15 scout) ──
//
// v13 read the text an interpreter is GIVEN. Measured by pleks against v15 and reproduced in canon,
// four shapes hand a shell text that no word of the command holds as an argument, and each was
// ALLOWED with a pushing, forcing payload:
//   source <(echo …)  . <(echo …)  bash <(echo …)   a process substitution's OUTPUT, run as a script
//   $(printf 'git push') origin x                   a substitution's OUTPUT, run as the command word
//   printf '…' > x.sh && sh x.sh                    a file written and then run, in ONE command
//   npx -c '…'  (npm exec -c, --call)               npm's own shell string — read since v17 by the
//                                                   unknown-program rule below, which covers it
// What a substitution writes is approximated as `givenTo` approximates a pipeline stage: the words
// and stdin of each of its commands. A file written by `>`/`>>`/`tee` earlier in the same command is
// remembered by name, and a shell, `source` or `.` that runs that name — or a command word that is
// it — is given its text. Every change is stricter: strings are added to what the rules read.
//
// NOT COVERED, and no reader of command text can cover it: a file written by one Bash call and run
// by a LATER one. The second call is `sh x.sh`, and the text it runs is in no command the gate sees.

/** What a command line writes, approximately: what each of its commands is given. */
const writtenBy = (src) => lexCommands(src).flatMap((c) => givenTo({ ...c, words: dropRedirections(c.words) })).join("\n");

/** A word that is wholly a substitution, `<(…)`, `$(…)` or `` `…` ``, as `{ inner, rest }`; else null. */
function substitution(word) {
  const open = /^[<$]\(/.test(word) ? 2 : word.startsWith("`") ? 1 : 0;
  if (!open) return null;
  const end = open === 2 ? word.lastIndexOf(")") : word.indexOf("`", 1);
  return end > open - 1 ? { inner: word.slice(open, end), rest: word.slice(end + 1) } : null;
}

// BOUNDED WORK, as v9's: a file's text is a pipeline's text, and a pipeline that writes a file at every
// stage made v16's first cut quadratic — 500 KB took 20 s. So a file holds a READER, not its text, read
// only when something runs it, and every read is counted. Past WRITTEN_BUDGET the consumed reading
// stops and `decide` asks: the deny rules still read the command's own segments.
const WRITTEN_BUDGET = 1_000_000;
class OverBudget extends Error {}
let writtenSpent = 0;

/** Files written earlier in one command line, by name (`./x.sh` is `x.sh`). */
function fileTable() {
  const map = new Map();
  const key = (name) => name.replace(/^\.\//, "");
  return {
    set: (name, read) => map.set(key(name), read),
    get(name) {
      const read = map.get(key(name));
      if (read === undefined) return null;
      const text = read();
      writtenSpent += text.length;
      if (writtenSpent > WRITTEN_BUDGET) throw new OverBudget();
      return text;
    },
  };
}

/** The files a command writes, by name, with a reader of what it writes: `>`, `>>`, `n>`, and tee's file arguments. */
function filesWritten(cmd, at, piped) {
  const out = [];
  // `piped` only grows past `len` or is replaced, so this slice is what this stage was given.
  const len = piped.length;
  const given = () => piped.slice(0, len);
  for (let i = 0; i < cmd.words.length; i++) {
    const m = /^\d*>>?(.*)$/.exec(cmd.words[i]);
    const name = m && (m[1] || cmd.words[i + 1]);
    if (name) out.push([name, () => [...givenTo({ ...cmd, words: dropRedirections(cmd.words) }), ...given()].join("\n")]);
  }
  if (at?.name === "tee") {
    for (const w of cmd.words.slice(at.i + 1)) if (!w.startsWith("-") && !/^\d*[<>]/.test(w)) out.push([w, () => [...cmd.stdin, ...given()].join("\n")]);
  }
  return out;
}

/** The first argument that is not an option or a redirection — `<(…)` is an argument, not a redirection. */
function firstOperand(args) {
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.startsWith("<(")) return w;
    if (/^\d*[<>]{1,2}&?$/.test(w)) i++;
    else if (!w.startsWith("-") && !/^\d*[<>]/.test(w)) return w;
  }
  return undefined;
}

/** The script a shell, `source` or `.` runs from its first operand, as text it can be read as. */
function scriptOf(word, files) {
  if (word === undefined) return null;
  const sub = substitution(word);
  if (sub && word.startsWith("<(")) return writtenBy(sub.inner);
  return files.get(word);
}

// ── A STRING HANDED TO A PROGRAM THE GATE DOES NOT KNOW (v17, pleks CF-21) ──
//
// v13 and v16 read the strings of runners the gate LISTS, and the set of runners is open. pleks
// measured on Windows + Git Bash, and canon reproduced against v16, every one ALLOWED:
//   cmd //c "…"  (Git Bash's spelling of /c)   wsl sh -c "…"   find -exec sh -c "…" \;   start cmd //c "…"
//   git filter-branch --tree-filter "…"   npm pkg set scripts.x="…"   npx concurrently "…"   npm --yes exec -c "…"
// and the same class: su -c, flock -c, busybox sh -c, ssh host "…", docker exec c sh -c "…".
// No list of runners can finish, so the rule is inverted for programs the gate does not know: every
// argument of an UNKNOWN program that is more than one word — it was quoted to be one argument — is
// read as a command, and so is the value of a `key=value` argument. Each act then gets its own verdict,
// not a flat deny. KNOWN programs keep their reading: an interpreter's is above; a PROSE or data
// command's words stay text (echo, grep, curl, jq, gh — so a PR body naming a runner is prose); and git
// is read only where git itself runs a shell — filter-branch's filters and rebase's --exec / -x — so a
// commit message stays a message. v16's `npx -c` reading is this rule's special case, and is removed.
//
// THE COST, declared: an unknown program given a quoted string that names a gated act is gated as if
// it ran it — `npx vitest -t "rejects rm -rf on root"` is read as `rm -rf on root`. Unknown fails
// toward the gate, as an unlisted heredoc receiver already does.
// NOT COVERED: expansions — `$VAR`, `$'…'` read as text, `${IFS}`, brace expansion — which no reader of
// text can resolve; and a runner given its command as separate unquoted words, which only the backstop's
// bare `git`/`rm`/`gh` reading sees.
const TEXT_TAKERS = new Set([...PROSE, ...HEREDOC_SINKS]);
const GIT_SHELL_OPTION = /^(?:--(?:tree|index|msg|commit|env|parent|tag-name)-filter|--exec|-x)(?:=([\s\S]*))?$/;

/** v17's strings for one command: what an unknown program, or git's shell-running options, are handed. */
function foreignStrings(cmd, at, kind) {
  if (!at || kind) return [];
  const args = cmd.words.slice(at.i + 1);
  const out = [];
  if (at.name === "git") {
    for (let i = 0; i < args.length; i++) {
      const m = GIT_SHELL_OPTION.exec(args[i]);
      if (m) out.push(m[1] ?? args[i + 1] ?? "");
    }
    return out;
  }
  if (TEXT_TAKERS.has(at.name)) return out;
  for (const w of args) {
    if (!/\s/.test(w)) continue;
    const kv = /^[^\s=]+=([\s\S]*)$/.exec(w);
    out.push(kv ? kv[1] : w);
  }
  return out;
}

/** v16's strings for one command: see the section above. `files` is updated with what it writes. */
function unquotedRuns(cmd, at, kind, files, piped) {
  const out = foreignStrings(cmd, at, kind);
  if (at) {
    const sub = substitution(cmd.words[at.i]);
    if (sub && !cmd.words[at.i].startsWith("<(")) out.push([writtenBy(sub.inner) + sub.rest, ...cmd.words.slice(at.i + 1)].join(" "));
    const runsFile = files.get(cmd.words[at.i]);
    if (runsFile !== null) out.push(runsFile);
    const sourced = at.name === "source" || at.name === ".";
    if ((kind === "shell" && shellString(cmd.words.slice(at.i + 1)) === null) || sourced) {
      const script = scriptOf(firstOperand(cmd.words.slice(at.i + 1)), files);
      if (script !== null) out.push(script);
    }
  }
  for (const [name, read] of filesWritten(cmd, at, piped)) files.set(name, read);
  return out;
}

/**
 * Every string something in `command` runs as a command: see the section above.
 *
 * `piped` is what the stages since the last one that RAN its input have written on. A stage that
 * runs its input empties it: what an interpreter prints is not in the command, and re-reading every
 * earlier stage at every later one is quadratic in a pipeline's length.
 */
function consumedStrings(command) {
  const out = [];
  let piped = [];
  const files = fileTable();
  for (const cmd of lexCommands(command.replace(/\\\r?\n/g, " "))) {
    const at = commandAt(cmd.words);
    const kind = at && interpreterKind(at.name);
    out.push(...unquotedRuns(cmd, at, kind, files, piped));
    const args = kind ? cmd.words.slice(at.i + 1) : [];
    const stdin = () => [...cmd.stdin, ...piped];
    let ran = kind === "shell" || kind === "windows" || kind === "code";
    if (kind === "shell") {
      out.push(...stdin());
      const s = shellString(args);
      if (s !== null) out.push(s);
    } else if (kind === "windows") {
      out.push(...stdin());
      const f = args.findIndex(windowsRun);
      if (f !== -1) out.push(args.slice(f + 1).join(" "));
    } else if (kind === "code") {
      for (const t of [...args, ...stdin()]) out.push(...literals(t));
    } else if (kind) {
      const sed = kind === "sed";
      const read = programs(args, stdin, sed ? /^-[A-Za-z]*[ef]$/ : /^-[ef]$/, sed ? SED_VALUED : AWK_VALUED);
      ran = read.fromStdin;
      for (const p of read.programs) {
        if (sed) out.push(...sedRuns(p));
        else if (AWK_RUNS.test(p)) out.push(...literals(p));
      }
    }
    if (ran || !cmd.pipe) piped = [];
    if (cmd.pipe && !ran) piped.push(...givenTo(cmd));
  }
  return out;
}

/** The segments of every consumed string, and of the strings THEY consume, to CONSUMED_DEPTH. */
function consumedSegments(command, depth = 1) {
  if (depth > CONSUMED_DEPTH) return [];
  const out = [];
  for (const s of consumedStrings(command)) out.push(...segments(maskMessageText(s)), ...consumedSegments(s, depth + 1));
  return out;
}

// ── BOUNDED WORK (v9, pleks CF-17) ──
//
// A hook that can be made to crash has failed open: Claude Code reads an exit other than 0 or 2 as a
// non-blocking error. v8 ran out of heap on 100 KB of `rm x rm x …` (exit 134, no decision), because
// the backstop copied the rest of the segment once per later `rm`, which is O(n·k), and every rule
// sliced each copy again. Two quadratics in the segment count went with it: the branch replay per
// git segment, and a copy of the whole plan per later position.
//
// Those two are now linear. The backstop's work cannot be, because every rule reads a later position
// as a token array, so it has a BUDGET instead: the tokens all its later positions span. Past it, the
// deny rules still run at every command word, and anything they do not deny is ASKED, never allowed.
// No verdict loosens; only a command too long to read in full is stopped for a human.
const LATER_BUDGET = 100_000;
const OVER_BUDGET = "too long to read past each command word (bash-gate's work budget) — failing to a prompt, not to silence";

/** `plan` with segment `index` read as `self` — a view, so building one per later position is O(1). */
const withSelf = (plan, index, self) =>
  new Proxy(plan, { get: (t, k, r) => (k === String(index) ? self : Reflect.get(t, k, r)) });

function decide(command) {
  // Flag scans run on the message-masked text; the rm rule on the unmasked text, so
  // `-m "rm -rf /"` is prose either way (rm is not at command position there).
  // v13: after the command's own segments, those of every string something in it runs. Appended,
  // so the branch each of the command's own segments lands on is computed exactly as before.
  // v14: then each segment again as its shell WORDS where they differ from its tokens — appended too.
  // v16: a command whose written files exceed WRITTEN_BUDGET is read without its consumed strings, and asked.
  writtenSpent = 0;
  let consumed = [];
  let unread = false;
  try {
    consumed = consumedSegments(command);
  } catch (e) {
    if (!(e instanceof OverBudget)) throw e;
    unread = true;
  }
  const read = [...segments(maskMessageText(command)), ...consumed];
  const segs = [...read, ...read.filter((s) => s.words).map((s) => ({ ...s, tokens: s.words.tokens, bare: s.words.bare }))];
  const plan = planOf(segs);
  let span = 0;
  let overBudget = false;
  const later = segs.map((s) => {
    if (overBudget) return [];
    const l = laterPositions(s, LATER_BUDGET - span);
    span += l.span;
    overBudget = l.over;
    return l.positions;
  });
  // The branch checked out before each segment, computed once and only if a rule asks.
  let states = null;
  const before = (i) => {
    if (states === null) {
      const root = process.env.CLAUDE_PROJECT_DIR || null;
      states = [headBranch()];
      for (let k = 0; k < plan.length; k++) states.push(branchStep(plan[k], states[k], root));
    }
    return states[i];
  };
  const hit = (rule) =>
    segs.some((s, index) =>
      fires(rule, s, command, { plan, index, before, unknowable: s.unknowable }) ||
      (!overBudget && later[index].some((l) => fires(rule, l, command, { plan: withSelf(plan, index, planOf([l])[0]), index, before, unknowable: l.unknowable }))));
  for (const [rule, why] of [...CANON_DENY, ...PROJECT_DENY]) {
    if (hit(rule)) return ["deny", why];
  }
  if (overBudget || unread) return ["ask", OVER_BUDGET];
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
