/**
 * .claude/hooks/canon-inbox.js — SessionStart, and after a push: one line from canon about this project, or nothing.
 *
 * @kit canon-inbox v4 — tracked OUTSIDE its `KIT:CONFIG` region. The region is yours; everything
 * else is canon's, and `check-kit-drift.mjs` says so if it changes here.
 *
 * Register it TWICE, with the same command `node "$CLAUDE_PROJECT_DIR/.claude/hooks/canon-inbox.js"`:
 * settings.json → hooks.SessionStart, matcher "startup"; and hooks.PostToolUse, matcher "Bash".
 * check-hook-registration fails a copy registered under only one of them.
 *
 * WHY IT EXISTS (M-KIT-32, 2026-10-05). Canon could already tell a project everything it knew about
 * it — `tools/inbox.mjs` — and no session ran it unprompted, so the owner carried every kit update
 * and every handover by hand, project to project. This asks at the start of each session instead,
 * through `inbox.mjs --quick`: handovers addressed to this project, and adopted kit rows behind
 * canon, from file reads alone (~160 ms measured). Nothing pending prints nothing.
 *
 * IT NEVER STOPS A SESSION, AND IT NEVER READS AS CLEAN WHEN IT DID NOT LOOK. Canon not where the
 * config says, a timeout, a crash: each prints one `NOT MEASURED` line naming why and exits 0. A
 * silent hook that could not reach canon would read exactly like an estate with nothing pending.
 *
 * IT READS CANON AND WRITES NOTHING, here or there. Taking an update is the session's own act —
 * `apply-kit --carry-only` from this checkout, which the line names when there is one to take.
 *
 * v2 (2026-10-05): A CLIENT FOLDER IS NOT AN ERROR. v1 looked for canon only BESIDE the project and
 * named the project by its folder, so a project filed `<dev>/<client>/<project>` looked for
 * `<dev>/<client>/dev-standards` and reported NOT MEASURED on every session. Canon is now the
 * nearest `dev-standards` beside this project or any folder above it, and the folder name is only
 * the fallback: canon names the project by the tree it is asked about (`inbox.mjs --tree`), so two
 * clients' `website` folders are two register keys, not one.
 *
 * v3 (2026-10-08, owner): AFTER A PUSH TOO. Session start is relative — a continued session never
 * sees one again, so canon could move under a session for days and that session would never hear
 * it. Every project's sessions push, so after a Bash call that runs `git … push` the hook asks again,
 * with `--after-task`: the line tells the session to take the updates once its current task is
 * done, not to interleave them, and a row below canon's floor before its next push. Any other Bash
 * call prints nothing and does not ask canon. It still refuses nothing.
 *
 * v4 (2026-10-08, blindly CF-11): a quoted path to git is one word — see `segments`.
 */
// @event SessionStart
// @matcher startup
// @event PostToolUse
// @matcher Bash
// @non-blocking it tells a session what canon holds for it; it refuses nothing, so it cannot fail open
// @no-twin it takes no permission away, so there is no settings rule for it to fall back to
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/* KIT:CONFIG canon — where canon is, and what canon calls this project.
 *
 * `null` takes the default: canon is the nearest `dev-standards` checkout beside this project or
 * beside any folder above it (`<dev>/<project>` and `<dev>/<client>/<project>` both find
 * `<dev>/dev-standards`), and canon names this project from the register by its path, falling back
 * to its folder's name. Set either only if your machine differs; a path here is a path on YOUR machine.
 */
const CANON_DIR = null;
const PROJECT = null;
/* KIT:CONFIG /canon */

const TIMEOUT_MS = 8_000;

const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

/** The nearest `<ancestor>/dev-standards` holding canon's inbox, or the sibling path to name when none does. */
function findCanon(from) {
  for (let at = dirname(from); ; at = dirname(at)) {
    if (existsSync(join(at, "dev-standards", "tools", "inbox.mjs"))) return join(at, "dev-standards");
    if (dirname(at) === at) return join(dirname(from), "dev-standards");
  }
}
const canonDir = resolve(CANON_DIR ?? findCanon(projectDir));
const project = PROJECT ?? basename(projectDir);
const inbox = join(canonDir, "tools", "inbox.mjs");

/** What Claude Code sent. A hook run by hand, or a stdin that is not JSON, reads as a session start. */
function input() {
  try {
    const v = JSON.parse(readFileSync(0, "utf8"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
const hook = input();
const event = hook.hook_event_name === "PostToolUse" ? "PostToolUse" : "SessionStart";
// After a tool call, only a push is a moment to speak: `push` as git's subcommand, after any global
// options. A miss costs one reminder and a false hit one extra line — this hook decides nothing.
/**
 * The command's segments as shell words: a quoted span is one word, its quotes dropped, and a
 * separator inside quotes separates nothing. v4 (blindly CF-11): v3 split at every space, so
 * `"C:/Program Files/Git/cmd/git.exe" push` was two words and neither was git.
 */
function segments(command) {
  const out = [[]];
  let word = null;
  let quote = null;
  const end = () => {
    if (word !== null) out.at(-1).push(word);
    word = null;
  };
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      word ??= "";
    } else if (/[;&|\n]/.test(ch)) {
      end();
      out.push([]);
    } else if (/\s/.test(ch)) {
      end();
    } else {
      word = (word ?? "") + ch;
    }
  }
  end();
  return out;
}

function pushes(command) {
  for (const words of segments(command)) {
    let i = words.findIndex((w) => /(?:^|[\\/])git(?:\.exe)?$/i.test(w));
    if (i === -1) continue;
    for (i++; i < words.length && words[i].startsWith("-"); i++) {
      if (words[i] === "-C" || words[i] === "-c") i++;
    }
    if (words[i] === "push") return true;
  }
  return false;
}
if (event === "PostToolUse" && !pushes(String(hook.tool_input?.command ?? ""))) process.exit(0);

/** `systemMessage` is shown to the person, `additionalContext` reaches the model. */
function say(line) {
  process.stdout.write(`${JSON.stringify({
    systemMessage: line,
    hookSpecificOutput: { hookEventName: event, additionalContext: line },
  })}\n`);
}

if (!existsSync(inbox)) {
  const where = CANON_DIR === null
    ? `no dev-standards beside ${projectDir.replace(/\\/g, "/")} or any folder above it`
    : `no canon at ${canonDir.replace(/\\/g, "/")}`;
  say(`📬 canon inbox: NOT MEASURED — ${where} (set CANON_DIR in .claude/hooks/canon-inbox.js if it lives elsewhere)`);
  process.exit(0);
}

const run = spawnSync(process.execPath, [inbox, project, "--quick", "--tree", projectDir, ...(event === "PostToolUse" ? ["--after-task"] : [])], {
  encoding: "utf8",
  timeout: TIMEOUT_MS,
});
if (run.error || run.status !== 0) {
  const why = run.error?.code === "ETIMEDOUT"
    ? `timed out after ${TIMEOUT_MS} ms`
    : run.error?.message ?? `exited ${run.status}: ${(run.stderr || run.stdout || "").trim().split("\n")[0] || "(no output)"}`;
  say(`📬 canon inbox: NOT MEASURED — ${why}`);
  process.exit(0);
}
const line = run.stdout.trim();
if (line) say(line);
process.exit(0);
