#!/usr/bin/env node
/**
 * scripts/prepush-scope.mjs — decide whether a push needs the DB tier.
 *
 * Prints "full" (run `check:full` — adds test:db + security:db + drift) or "quick" (`check`).
 *
 * WHY: `check:full` takes over ten minutes — `check` ~2.5min, `test:db` ~5min, `security:db` on
 * top. Paying that on a docs-only push trains people to reach for --no-verify, and a gate people
 * route around is worse than no gate because it still reads as protection. CI's `db-tests` job
 * runs test:db and security:db on the PR regardless, so the DB tier is never actually skipped —
 * only moved off the local hot path when the diff cannot affect it.
 *
 * SCOPE, and one deliberate extension beyond "touches supabase/": `test/db/**` and the DB vitest
 * config also select the full tier. Editing the DB tests and then not running them is the same
 * hole as editing a migration and not running them — the ruling was about blast radius, not about
 * the literal directory name.
 *
 * Probe-first, both directions: `--selftest`.
 */
import { execSync } from "node:child_process"

/** Pure: does this file list require the DB tier? Exported shape is the testable part. */
export function needsDbTier(files) {
  return files.some(
    (f) =>
      f.startsWith("supabase/") ||
      f.startsWith("test/db/") ||
      f.startsWith("scripts/security/") ||
      /^vitest\.db\.config\./.test(f),
  )
}

/**
 * Files this push would send. Compared against the upstream's merge base where one exists; a
 * branch with no upstream is a first push, and "no upstream" must mean RUN EVERYTHING rather than
 * silently comparing against nothing — an empty file list would otherwise read as "docs only".
 */
function changedFiles() {
  const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  let base
  try {
    base = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}")
  } catch {
    return null // no upstream → caller escalates to full
  }
  try {
    return sh(`git diff --name-only ${base}...HEAD`).split(/\r?\n/).filter(Boolean)
  } catch {
    return null
  }
}

if (process.argv.includes("--selftest")) {
  const CASES = [
    ["a migration selects the full tier", ["supabase/migrations/002_contacts.sql"], true],
    ["supabase config selects the full tier", ["supabase/config.toml"], true],
    ["editing the DB tests selects the full tier", ["test/db/tier.ts"], true],
    ["the DB vitest config selects the full tier", ["vitest.db.config.ts"], true],
    ["a security script selects the full tier", ["scripts/security/audit.mjs"], true],
    ["docs only stays quick", ["CLAUDE.md", "docs/MECHANISABLE.md"], false],
    ["app code with no DB surface stays quick", ["app/(tenant)/page.tsx", "lib/dates/index.ts"], false],
    ["an empty diff stays quick", [], false],
    // The mixed case is the one that matters: any DB file anywhere in the set wins.
    ["a mixed diff escalates to full", ["CLAUDE.md", "supabase/migrations/001_foundation.sql"], true],
    // Guard against a prefix that merely CONTAINS the word.
    ["a path merely mentioning supabase stays quick", ["lib/supabase/gateway.ts"], false],
  ]
  let failed = 0
  for (const [name, files, want] of CASES) {
    const got = needsDbTier(files)
    const ok = got === want
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} must be ${want ? "full " : "quick"} — ${name}${ok ? "" : `\n      got: ${got}`}`)
  }
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — escalates on DB surface, stays quick otherwise")
  process.exit(failed ? 1 : 0)
}

const files = changedFiles()
// Fail toward MORE checking, never less: an unknown diff runs the full tier.
process.stdout.write(files === null || needsDbTier(files) ? "full" : "quick")
