#!/usr/bin/env node
/**
 * scripts/check-drift-if-sql-changed.mjs
 *
 * Conditional schema drift gate for check:full. Runs check-schema-drift.mjs when
 * supabase/migrations/*.sql has changed, OR when prod has not been verified in STALE_DAYS.
 *
 * Why conditional at all: the drift check hits the live DB and needs network plus
 * SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN (a Management-API token, NOT the service-role key —
 * see check-schema-drift.mjs). Running it on every push is expensive and offline-hostile.
 *
 * ── WHY "SQL CHANGED" WAS NEVER ENOUGH, FOUND 2026-08-22 ──────────────────────────────────────
 * That condition answers "could THIS push have introduced drift?" and cannot answer "is prod
 * already drifted?". `contact_change_requests` was defined in a migration merged 2026-08-18 and
 * never applied to prod; it was invisible to every push that did not itself touch
 * supabase/migrations/** — which is most of them — and was found four days later by coincidence.
 * The staleness arm exists so someone else's unapplied migration surfaces within a week.
 * See the STALENESS TRIGGER block below for the state file and its failure directions.
 *
 * ── THE BUG THIS FILE SHIPPED WITH, FOUND 2026-08-19 ──────────────────────────────────────────
 * It compared ONLY the working tree — `git diff --cached` plus `git diff`. That is right for a
 * pre-COMMIT context and wrong for the one it is actually wired into: `check:full` runs at
 * PRE-PUSH, where the change is already committed, so both diffs are empty and the condition was
 * always false. **The drift check had never once run in the gate that invokes it.**
 *
 * It was found because a commit that added four lines to 009_security.sql printed
 * "[drift] No migration SQL changed" while `prepush-scope.mjs`, reading the committed range,
 * had correctly routed the same diff to the full tier. Two checks disagreeing about one diff.
 *
 * The message was the tell, and it is the recurring shape: it reported a claim about the WORLD
 * ("no migration SQL changed") when what it had measured was "the working tree is clean" — which
 * at pre-push is unconditionally true. An instrument that reports something other than what it
 * measured cannot be caught by reading its output, because its output is always plausible.
 *
 * Now considers the committed range against the upstream as well, and says which window it used.
 */

import { execSync, execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as dotenv from "dotenv"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// ── STALENESS TRIGGER (2026-08-22) ──────────────────────────────────────────────────────────────
// The SQL-changed trigger above answers "could THIS push have introduced drift?". It cannot answer
// "is prod already drifted?", and that second question is the one that bit: `contact_change_requests`
// was defined in a migration merged 2026-08-18 (PR #256) and never applied to prod. It was invisible
// to every push that did not itself touch `supabase/migrations/**` — which is most of them — and was
// found four days later by coincidence, not by a gate.
//
// So the trigger gains a second arm: run drift if the last SUCCESSFUL run is older than STALE_DAYS,
// or if there is no record at all. Someone else's unapplied migration now surfaces within a week on
// the first machine that pushes anything.
//
// STATE LIVES IN `node_modules/`, deliberately — same idiom as `node_modules/.vitest-count.json`:
//   • auto-ignored, so no `.gitignore` entry to forget and nothing per-clone leaking into commits;
//   • machine-local, which is correct — "when did THIS clone last verify prod?" is not a repo fact;
//   • wiped by a reinstall, which resets to "due". That is the SAFE direction: a lost record makes
//     the check run, never skip.
const STALE_DAYS = 7
const STATE_FILE = resolve(ROOT, "node_modules/.drift-last-run.json")

/**
 * Pure, so both arms are probeable without touching disk or the clock. Returns the REASON as well as
 * the boolean — every message this file prints has to say what was measured, not what is true of the
 * world (the L-28 scar at the top of this file is exactly that mistake).
 */
export function driftDue(lastRunIso, nowMs, staleDays = STALE_DAYS) {
  if (!lastRunIso) return { due: true, reason: "no record of a previous successful drift run on this machine" }
  const then = Date.parse(lastRunIso)
  // An unparseable stamp is corruption, not freshness. Fail toward running.
  if (Number.isNaN(then)) return { due: true, reason: `unreadable last-run stamp (${JSON.stringify(lastRunIso)})` }
  const days = (nowMs - then) / 86_400_000
  // A stamp from the FUTURE means a clock change or a copied state file — same treatment.
  if (days < 0) return { due: true, reason: `last-run stamp is in the future (${lastRunIso})` }
  return days > staleDays
    ? { due: true, reason: `last successful run was ${days.toFixed(1)} days ago, over the ${staleDays}-day staleness window` }
    : { due: false, reason: `last successful run was ${days.toFixed(1)} days ago` }
}

/** Last successful run, or null. A malformed/absent file reads as null → due. */
export function readLastRun(file = STATE_FILE) {
  try {
    return JSON.parse(readFileSync(file, "utf8")).lastSuccessIso ?? null
  } catch {
    return null
  }
}

/**
 * Stamped ONLY after drift exits 0. A failed or un-run check must never stamp — otherwise the first
 * broken run silences the trigger for a week, which is the failure mode that makes a staleness gate
 * worse than none.
 */
function recordSuccess(nowIso, file = STATE_FILE) {
  try {
    writeFileSync(file, `${JSON.stringify({ lastSuccessIso: nowIso }, null, 2)}\n`)
  } catch {
    // node_modules absent or read-only — the next run simply reads "due" again. Never fatal.
  }
}

/**
 * Does this machine hold the drift credentials? `check-schema-drift.mjs` reads them from
 * `.env.local` via dotenv, so `process.env` alone is not the answer — parsed here WITHOUT mutating
 * `process.env`, so this probe cannot change what any later child process sees.
 */
export function hasDriftCredentials(envFile = resolve(ROOT, ".env.local")) {
  const fromFile = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)) : {}
  const get = (k) => process.env[k] || fromFile[k]
  return Boolean(get("SUPABASE_PROJECT_ID") && get("SUPABASE_ACCESS_TOKEN"))
}

/** Pure: does this file list contain migration SQL? Exported so both directions are probeable. */
export function hasMigrationSql(files) {
  return files.some((f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql"))
}

// stderr piped, not inherited: `@{u}` legitimately fails on a detached HEAD, and letting git print
// `fatal: HEAD does not point to a branch` into an otherwise-green run trains readers to scroll past
// the word "fatal". A handled condition must not look like an incident.
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim()

/**
 * Every window a change could be hiding in: the working tree AND the commits this push would
 * send. Returns { files, window } — `window` is reported so a skip states what it looked at
 * rather than asserting a fact about the repository.
 */
export function changedFiles() {
  const files = []
  const windows = []
  try {
    const staged = sh("git diff --name-only --cached")
    const unstaged = sh("git diff --name-only")
    if (staged || unstaged) windows.push("working tree")
    files.push(...`${staged}\n${unstaged}`.split(/\r?\n/).filter(Boolean))
  } catch {
    return { files: [], window: "none (not a git repo)", degraded: true }
  }
  try {
    const base = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}")
    const range = sh(`git diff --name-only ${base}...HEAD`)
    windows.push(`commits vs ${base}`)
    files.push(...range.split(/\r?\n/).filter(Boolean))
  } catch {
    // No upstream — a first push. Cannot bound the committed range, so do NOT claim it is clean.
    return { files, window: windows.join(" + ") || "working tree", degraded: true }
  }
  return { files, window: windows.join(" + ") || "working tree", degraded: false }
}

if (process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  ok(hasMigrationSql(["supabase/migrations/009_security.sql"]), "a migration .sql fires")
  ok(!hasMigrationSql(["supabase/migrations/README.md"]), "a non-.sql in the migrations dir does not")
  ok(!hasMigrationSql(["lib/db/query.sql"]), "a .sql outside the migrations dir does not")
  ok(!hasMigrationSql([]), "an empty file list does not")
  ok(hasMigrationSql(["CLAUDE.md", "supabase/migrations/001_foundation.sql"]), "a mixed list fires")

  // The regression that matters — asserted as a CODE property, not an environment one.
  //
  // The first version of this probe demanded the window always contain "commits vs …". That passed
  // locally and FAILED IN CI, where the checkout is a detached HEAD with no upstream, so `@{u}`
  // cannot resolve and the window is legitimately just the working tree. The code was right and
  // the probe was wrong: it asserted a property of the environment it happened to run in. Same
  // shape as the bug this file exists to fix (L-28), one level up.
  //
  // The invariant that actually holds everywhere: WHEN an upstream exists the window must include
  // the committed range; when it does NOT, the result must be `degraded` so the caller runs the
  // check instead of reporting "nothing changed". Never a silent skip either way.
  const res = changedFiles()
  let hasUpstream = true
  try { sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}") } catch { hasUpstream = false }

  if (hasUpstream) {
    ok(/commits vs /.test(res.window) && !res.degraded,
      `with an upstream, the window includes the committed range (got "${res.window}")`)
  } else {
    ok(res.degraded === true,
      `with NO upstream (detached HEAD / CI), the result is degraded so the check RUNS rather than skipping (window "${res.window}")`)
  }

  // ── The staleness arm, both directions ───────────────────────────────────────────────────────
  // Pure over (stamp, now), so no probe here touches disk or the wall clock — the reason `driftDue`
  // takes both rather than reading them.
  const DAY = 86_400_000
  const NOW = Date.parse("2026-08-22T12:00:00.000Z")
  const ago = (d) => new Date(NOW - d * DAY).toISOString()

  ok(driftDue(ago(8), NOW).due, "a run 8 days ago is DUE — past the 7-day window")
  ok(!driftDue(ago(1), NOW).due, "KNOWN-GOOD: a run yesterday is NOT due — the trigger does not fire on every push")
  ok(!driftDue(ago(6.9), NOW).due, "KNOWN-GOOD: just inside the window is not due")
  ok(driftDue(ago(7.1), NOW).due, "…and just outside it is — the boundary is real, not a no-op")

  // Every degenerate stamp must fail TOWARD running. These are the ways a staleness gate silently
  // turns itself off: an absent record reading as fresh, a corrupt one throwing or being trusted, a
  // future stamp (clock change, or a state file copied between machines) parking it forever.
  ok(driftDue(null, NOW).due, "no record at all is DUE — a missing stamp must never read as fresh")
  ok(driftDue("not-a-date", NOW).due, "an unreadable stamp is DUE — corruption is not freshness")
  ok(driftDue(new Date(NOW + 30 * DAY).toISOString(), NOW).due,
    "a stamp from the FUTURE is DUE — a clock change or a copied state file cannot park the trigger forever")

  // The reason is carried, not just the boolean: every message this file prints has to state what it
  // measured, and a bare `true` cannot.
  ok(/no record/.test(driftDue(null, NOW).reason) && /\d/.test(driftDue(ago(8), NOW).reason),
    "the verdict carries a stated reason in both shapes — the L-28 rule, applied to this arm")

  // readLastRun's contract on a path that does not exist. Its tolerance is what makes a missing or
  // half-written state file read as `null` → due, rather than throwing inside a pre-push gate.
  ok(readLastRun(resolve(ROOT, "node_modules/.no-such-drift-state.json")) === null,
    "readLastRun on a missing file yields null (→ due), rather than throwing mid-gate")

  // The credential probe decides whether a DUE run blocks or stands aside, so getting it wrong in
  // the false-positive direction would report "prod verified" on a machine that verified nothing.
  // Asserted as a CODE property, not an environment one — same lesson as the window probe above:
  // this machine HAS the credentials in `.env.local`, so the environment-independent statement is
  // "with no env file and nothing in process.env, the answer is false".
  const credsInProcessEnv = Boolean(process.env.SUPABASE_PROJECT_ID && process.env.SUPABASE_ACCESS_TOKEN)
  if (credsInProcessEnv) {
    ok(hasDriftCredentials("/nonexistent/.env.local") === true,
      "credentials exported in process.env are honoured even with no .env.local — CI/shell-exported is a real shape")
  } else {
    ok(hasDriftCredentials("/nonexistent/.env.local") === false,
      "no .env.local and nothing in process.env → NOT credentialled, so a DUE run stands aside instead of claiming prod was verified")
  }
  // It must not leave the token in `process.env` for whatever runs next.
  hasDriftCredentials()
  ok(Boolean(process.env.SUPABASE_ACCESS_TOKEN) === credsInProcessEnv,
    "hasDriftCredentials does not mutate process.env — it parses .env.local rather than loading it")

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — detects migration SQL in tree AND commits, and fires on staleness with every degenerate stamp failing toward running")
  process.exit(failed ? 1 : 0)
}

const { files, window, degraded } = changedFiles()
const stale = driftDue(readLastRun(), Date.now())

// Two arms, and the distinction is load-bearing rather than cosmetic:
//
//   REQUIRED  — this push could itself have introduced drift (migration SQL changed), or the window
//               could not be bounded at all. A failure here BLOCKS, including a missing credential:
//               "I changed a migration and cannot verify prod" is not a state to push from.
//   DUE       — nothing in this push touches migrations, but prod has not been verified in a week.
//               Opportunistic hygiene. If drift RUNS it is fully authoritative and a finding still
//               blocks — but a machine with no token reports and stands aside rather than blocking
//               a docs push on a credential it was never expected to hold.
//
// A soft arm that fell back to "skipping" would rebuild the exact hole this trigger was added to
// close, so the message for it never says "no drift" — it says DUE AND NOT RUN, with the cause.
const required = degraded || hasMigrationSql(files)

if (required) {
  console.log(degraded && !hasMigrationSql(files)
    ? `[drift] Could not bound the change window (${window}) — running the drift check rather than assuming clean.`
    : `[drift] Migration SQL changed in ${window} — running schema drift check...`)
} else if (stale.due) {
  if (!hasDriftCredentials()) {
    console.log(`[drift] ⚠ DUE AND NOT RUN — ${stale.reason}, but this machine has no SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN.`)
    console.log(`[drift]   Prod was NOT verified. This is not a clean result — it is an unanswered question, and it stays due.`)
    process.exit(0)
  }
  console.log(`[drift] No migration SQL in ${window}, but drift is DUE — ${stale.reason}. Running.`)
  console.log(`[drift]   Why: a migration merged by someone else and never applied is invisible to every push that does not touch supabase/migrations/**.`)
} else {
  console.log(`[drift] No migration SQL in ${window}, and drift is fresh (${stale.reason}) — skipping schema drift check.`)
  process.exit(0)
}

try {
  // `execFileSync(process.execPath, …)`, not `execSync("node …")`. Two changes, one reason each:
  // the interpreter is the one running this script rather than whatever PATH resolves, and the
  // argument is an array rather than a shell string, so no shell parses the path.
  execFileSync(process.execPath, ["scripts/check-schema-drift.mjs"], { cwd: ROOT, stdio: "inherit" })
} catch {
  process.exit(1)
}

// Reached only on exit 0 from the drift check — i.e. prod genuinely matches the migrations.
recordSuccess(new Date().toISOString())
