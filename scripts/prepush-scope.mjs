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
import { readFileSync } from "node:fs"

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
 * Parse git's pre-push stdin: `<local ref> <local sha> <remote ref> <remote sha>` per ref.
 *
 * The hook never read this, and `changedFiles()` used `@{u}` of HEAD instead — so the scope was
 * computed for the CURRENT BRANCH rather than for what was actually being pushed.
 * `git push origin migration-branch` while checked out on a docs branch returned `quick` and
 * skipped the DB tier on a diff full of migrations; `git push --all` did the same. Neither probe
 * could see it: the selftest exercises the pure `needsDbTier(files)`, and check-git-hooks drives
 * the hook through PLEKS_PREPUSH_CMD, which short-circuits the scope branch entirely. The
 * hook→scope→command composition had no probe at all.
 */
export function refsToRange(stdin) {
  const ZERO = /^0+$/
  const out = []
  for (const line of stdin.split(/\r?\n/)) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/)
    if (!localSha || ZERO.test(localSha)) continue // a deletion pushes nothing
    // A brand-new remote branch has an all-zero remote sha: nothing to diff against, so the
    // honest answer is "cannot bound it", which escalates rather than skipping.
    if (!remoteSha || ZERO.test(remoteSha)) return null
    out.push(`${remoteSha}..${localSha}`)
  }
  return out.length ? out : null
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
  // Declared before the first loop that touches it. Placed below, a FAILING ref probe would throw
  // a temporal-dead-zone ReferenceError instead of reporting — the suite crashing rather than
  // saying which case broke, which is the one thing a probe suite may not do.
  let failed = 0

  // The ref parsing, which is what makes the scope follow the PUSH rather than the checkout.
  const R = [
    ["a normal ref yields its range", "refs/heads/x aaa refs/heads/x bbb", ["bbb..aaa"]],
    ["two refs yield two ranges", "refs/heads/a 111 refs/heads/a 222\nrefs/heads/b 333 refs/heads/b 444", ["222..111", "444..333"]],
    ["a NEW remote branch (zero remote sha) cannot be bounded", "refs/heads/x aaa refs/heads/x 0000000000000000000000000000000000000000", null],
    ["a deletion (zero local sha) pushes nothing", "refs/heads/x 0000000000000000000000000000000000000000 refs/heads/x bbb", null],
    ["empty stdin yields nothing to bound", "", null],
  ]
  for (const [name, input, want] of R) {
    const got = refsToRange(input)
    const ok2 = JSON.stringify(got) === JSON.stringify(want)
    if (!ok2) failed++
    console.log(`  ${ok2 ? "✓" : "✗"} REFS  — ${name}${ok2 ? "" : `\n      got: ${JSON.stringify(got)}`}`)
  }

  for (const [name, files, want] of CASES) {
    const got = needsDbTier(files)
    const ok = got === want
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} must be ${want ? "full " : "quick"} — ${name}${ok ? "" : `\n      got: ${got}`}`)
  }
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — escalates on DB surface, stays quick otherwise")
  process.exit(failed ? 1 : 0)
}

/** Read git's pre-push payload if the hook piped it in; empty when run by hand. */
function readStdin() {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

const piped = readStdin().trim()
const git = (c) => execSync(c, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
let files

if (piped) {
  // AUTHORITATIVE: these are the refs actually being pushed, whatever branch is checked out.
  const ranges = refsToRange(piped)
  if (ranges === null) {
    files = null // new branch or deletion-only — cannot bound it, so escalate
  } else {
    files = []
    for (const r of ranges) {
      try {
        files.push(...git(`git diff --name-only ${r}`).split(/\r?\n/).filter(Boolean))
      } catch {
        files = null
        break
      }
    }
  }
} else {
  // Run by hand (or by a probe): fall back to the current branch's upstream.
  files = changedFiles()
}

// Fail toward MORE checking, never less: an unknown diff runs the full tier.
process.stdout.write(files === null || needsDbTier(files) ? "full" : "quick")
