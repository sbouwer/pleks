/**
 * .claude/hooks/canon-inbox.js — SessionStart: one line from canon about this project, or nothing.
 *
 * @kit canon-inbox v2 — tracked OUTSIDE its `KIT:CONFIG` region. The region is yours; everything
 * else is canon's, and `check-kit-drift.mjs` says so if it changes here.
 *
 * Register: settings.json → hooks.SessionStart, matcher "startup", command
 * `node "$CLAUDE_PROJECT_DIR/.claude/hooks/canon-inbox.js"`.
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
 */
// @event SessionStart
// @matcher startup
// @non-blocking it tells a session what canon holds for it; it refuses nothing, so it cannot fail open
// @no-twin it takes no permission away, so there is no settings rule for it to fall back to
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/* KIT:CONFIG canon — where canon is, and what canon calls this project.
 *
 * `null` takes the default: canon is the `dev-standards` checkout BESIDE this project's, and this
 * project's name is its folder's name — which is how `ledgers/projects.json` registers every project
 * today. Set either only if your machine differs; a path here is a path on YOUR machine.
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

/** SessionStart output: `systemMessage` is shown to the person, `additionalContext` reaches the model. */
function say(line) {
  process.stdout.write(`${JSON.stringify({
    systemMessage: line,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: line },
  })}\n`);
}

if (!existsSync(inbox)) {
  const where = CANON_DIR === null
    ? `no dev-standards beside ${projectDir.replace(/\\/g, "/")} or any folder above it`
    : `no canon at ${canonDir.replace(/\\/g, "/")}`;
  say(`📬 canon inbox: NOT MEASURED — ${where} (set CANON_DIR in .claude/hooks/canon-inbox.js if it lives elsewhere)`);
  process.exit(0);
}

const run = spawnSync(process.execPath, [inbox, project, "--quick", "--tree", projectDir], {
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
