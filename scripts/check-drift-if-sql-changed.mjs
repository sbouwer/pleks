#!/usr/bin/env node
/**
 * scripts/check-drift-if-sql-changed.mjs
 *
 * Conditional schema drift gate for check:full. Runs check-schema-drift.mjs only when
 * supabase/migrations/*.sql has changed. Exits 0 immediately otherwise.
 *
 * Why conditional: the drift check hits the live DB and needs network + SUPABASE_SERVICE_ROLE_KEY.
 * Running it on every push regardless of whether SQL changed is expensive and offline-hostile.
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

import { execSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

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

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — detects migration SQL in tree AND commits")
  process.exit(failed ? 1 : 0)
}

const { files, window, degraded } = changedFiles()

// Fail toward RUNNING the check: an indeterminate window must not be reported as "nothing changed".
if (degraded && !hasMigrationSql(files)) {
  console.log(`[drift] Could not bound the change window (${window}) — running the drift check rather than assuming clean.`)
} else if (!hasMigrationSql(files)) {
  console.log(`[drift] No migration SQL in ${window} — skipping schema drift check.`)
  process.exit(0)
} else {
  console.log(`[drift] Migration SQL changed in ${window} — running schema drift check...`)
}

try {
  execSync("node scripts/check-schema-drift.mjs", { cwd: ROOT, stdio: "inherit" })
} catch {
  process.exit(1)
}
