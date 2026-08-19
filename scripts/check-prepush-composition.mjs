#!/usr/bin/env node
/**
 * scripts/check-prepush-composition.mjs — the hook → scope → command path, end to end.
 *
 * WHY THIS EXISTS, in `prepush-scope.mjs`'s own words: "The hook→scope→command composition had no
 * probe at all." Two suites bracket it and neither crosses it —
 *
 *   prepush-scope --selftest   drives the PURE functions (`needsDbTier`, `refsToRange`) with
 *                              hand-built inputs, and never runs the hook
 *   check-git-hooks            drives the HOOK through `PLEKS_PREPUSH_CMD`, which short-circuits
 *                              the scope branch entirely — the branch under test is the one the
 *                              seam exists to skip
 *
 * So the wiring between them — git's stdin format reaching `refsToRange`, its ranges reaching
 * `git diff`, that file list reaching `needsDbTier`, and the answer selecting `check` vs
 * `check:full` — was covered at both ends and nowhere in the middle. That is where the bug this
 * repo already hit lived: the hook did not read stdin at all, so `git push origin migration-branch`
 * from a docs branch skipped the DB tier on a diff full of migrations. Both bracketing suites were
 * green throughout.
 *
 * REAL refs from THIS repo's history, in git's real stdin format, through the real hook. `npm` is
 * shimmed on PATH so the hook resolves AND invokes its command while the command returns instantly
 * — never a two-minute chain, and never the recursion that a real `npm run check` would cause,
 * since `check-prepush-composition` is itself in that chain (LESSONS L-34).
 */
import { spawnSync, execSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const HOOK = ".githooks/pre-push"
const ZERO = "0".repeat(40)

const git = (c) => execSync(c, { encoding: "utf8" }).trim()

// A commit that touched supabase/ and one that did not, resolved from history rather than pinned:
// a pinned sha rots out of the repo the first time someone rewrites it, and a probe whose fixture
// has vanished reports whatever the empty case reports.
const dbCommit = git("git log --format=%H -1 -- supabase/")
const dbParent = git(`git rev-parse ${dbCommit}~1`)
const head = git("git rev-parse HEAD")
const headParent = git("git rev-parse HEAD~1")

let failed = 0
const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

ok(!!dbCommit, `history still contains a supabase/ commit to use as a fixture (${dbCommit.slice(0, 8)})`)
ok(git(`git diff --name-only ${dbParent} ${dbCommit}`).split("\n").some((f) => f.startsWith("supabase/")),
  "…and its diff really does touch supabase/ — the fixture is what it claims to be")
ok(!git(`git diff --name-only ${headParent} ${head}`).split("\n").some((f) => f.startsWith("supabase/")),
  "…and HEAD's diff really does not")

const shimDir = mkdtempSync(join(tmpdir(), "prepush-shim-"))
writeFileSync(join(shimDir, "npm"), '#!/bin/sh\necho "SHIM npm $*"\nexit 0\n', { mode: 0o755 })

/** Drive the real hook with git's real pre-push stdin, and report the command it resolved. */
function resolvedFor(stdin) {
  const r = spawnSync("sh", [HOOK], {
    input: stdin,
    encoding: "utf8",
    // No PLEKS_HOOK_PROBE / PLEKS_PREPUSH_CMD: the scope branch is the whole point.
    env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, PLEKS_HOOK_PROBE: "", PLEKS_PREPUSH_CMD: "" },
  })
  const out = String(r.stdout ?? "")
  const arrows = out.split(/\r?\n/).filter((l) => l.includes("→"))
  return {
    cmd: (arrows.at(-1) ?? "").replace(/^.*→\s*/, "").trim(),
    invoked: out.includes("SHIM npm run check"),
    status: r.status,
  }
}

const ref = (local, remote) => `refs/heads/x ${local} refs/heads/x ${remote}\n`

const CASES = [
  ["a push whose diff touches supabase/ selects the FULL tier",
    ref(dbCommit, dbParent), "npm run check:full"],
  ["a push whose diff touches no DB surface stays QUICK",
    ref(head, headParent), "npm run check"],
  // The bug that motivated reading stdin: the scope must follow the PUSHED refs, not the checkout.
  // Both cases above run on the SAME checked-out branch and must disagree — if the hook ignored
  // stdin they would necessarily agree, whatever the answer.
  ["a NEW remote branch cannot be bounded, so it escalates to FULL",
    ref(head, ZERO), "npm run check:full"],
  ["two refs, one of them DB-touching, escalate the whole push",
    `${ref(head, headParent)}${ref(dbCommit, dbParent)}`, "npm run check:full"],
  ["an unparseable stdin escalates rather than skipping",
    "not a ref line at all\n", "npm run check:full"],
]

for (const [name, stdin, want] of CASES) {
  const { cmd, invoked } = resolvedFor(stdin)
  const good = cmd === want && invoked
  if (!good) failed++
  console.log(`  ${good ? "✓" : "✗"} ${name}${good ? "" : `\n      resolved "${cmd}", wanted "${want}"${invoked ? "" : " (and never invoked it)"}`}`)
}

// The composition's whole claim is that the two answers DIFFER for the same checkout. Asserted
// directly, so a hook that returned one constant could not pass by matching the more common case.
{
  const a = resolvedFor(ref(dbCommit, dbParent)).cmd
  const b = resolvedFor(ref(head, headParent)).cmd
  ok(a !== b, `the same checkout yields different tiers for different pushed refs ("${a}" vs "${b}")`)
}

rmSync(shimDir, { recursive: true, force: true })
console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — stdin → scope → tier, end to end through the real hook")
process.exit(failed ? 1 : 0)
