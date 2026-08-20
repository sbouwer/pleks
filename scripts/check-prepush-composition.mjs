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
// stderr is swallowed deliberately: on a shallow checkout these calls are EXPECTED to fail, and
// a wall of git fatals above a clean SKIPPED line reads like a crash.
const gitOrNull = (c) => {
  try { return execSync(c, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim() } catch { return null }
}

let failed = 0
const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

// A commit that touched supabase/ and one that did not, resolved from history rather than pinned:
// a pinned sha rots out of the repo the first time someone rewrites it, and a probe whose fixture
// has vanished reports whatever the empty case reports.
//
// ⚠ THIS PROBE NEEDS REAL HISTORY, and CI does not have it. `actions/checkout` clones with
// `--depth=1`, so `<sha>~1` is not a revision there and the first version of this file crashed the
// Lint & Typecheck job. The property under test is a LOCAL pre-push behaviour — the hook only ever
// runs on a developer's full clone — so a shallow checkout is a case this probe cannot speak to
// rather than one it should fail on.
//
// The skip is LOUD and CONDITIONAL: shallow → announce which fixtures could not be built and why;
// NOT shallow but the fixtures still will not resolve → a real failure, because that means the
// repository changed under the probe. A silent `exit 0` here would be the "reports safety while
// checking nothing" shape this whole suite exists to prevent.
const shallow = gitOrNull("git rev-parse --is-shallow-repository") === "true"
const dbCommit = gitOrNull("git log --format=%H -1 -- supabase/")
const dbParent = dbCommit ? gitOrNull(`git rev-parse ${dbCommit}~1`) : null

/**
 * A commit whose diff touches NO DB surface — SEARCHED, not assumed to be HEAD.
 *
 * The first version used HEAD..HEAD~1 and asserted it was DB-free. That held until a commit touched
 * `scripts/security/`, which `needsDbTier` counts (correctly — editing the security scripts and not
 * running them is the same hole as editing a migration and not running it). Then the "quick" case
 * had no quick fixture and two probes went red on a working hook. A fixture derived from "whatever
 * is on top" is a fixture that changes under you; derive it from the PROPERTY instead.
 */
const DB_SURFACE = /^(supabase\/|test\/db\/|scripts\/security\/|vitest\.db\.config\.)/
function findQuickCommit() {
  const shas = (gitOrNull("git log --format=%H -40") ?? "").split(/\r?\n/).filter(Boolean)
  for (const sha of shas) {
    const parent = gitOrNull(`git rev-parse ${sha}~1`)
    if (!parent) continue
    const files = (gitOrNull(`git diff --name-only ${parent} ${sha}`) ?? "").split(/\r?\n/).filter(Boolean)
    if (files.length && !files.some((f) => DB_SURFACE.test(f))) return { sha, parent }
  }
  return { sha: null, parent: null }
}
const { sha: head, parent: headParent } = findQuickCommit()

if (!dbCommit || !dbParent || !head || !headParent) {
  const why = shallow
    ? "the checkout is SHALLOW (actions/checkout --depth=1), so a commit's parent is not a revision here"
    : "history is FULL, so this is a real problem: the fixtures this probe derives from history no longer resolve"
  console.log(`  – ${shallow ? "SKIPPED" : "FAILED"} — ${why}`)
  console.log(`    (dbCommit=${dbCommit?.slice(0, 8) ?? "none"} dbParent=${dbParent?.slice(0, 8) ?? "none"} head=${head?.slice(0, 8) ?? "none"} headParent=${headParent?.slice(0, 8) ?? "none"})`)
  console.log(shallow
    ? "\n⏭  prepush composition NOT probed on this checkout — it is a local pre-push property and runs on every developer clone"
    : "\n❌ prepush composition could not build its fixtures on a full clone")
  process.exit(shallow ? 0 : 1)
}

ok(!!dbCommit, `history still contains a supabase/ commit to use as a fixture (${dbCommit.slice(0, 8)})`)
ok(git(`git diff --name-only ${dbParent} ${dbCommit}`).split("\n").some((f) => f.startsWith("supabase/")),
  "…and its diff really does touch supabase/ — the fixture is what it claims to be")
ok(!git(`git diff --name-only ${headParent} ${head}`).split("\n").some((f) => DB_SURFACE.test(f)),
  `…and the quick fixture (${head.slice(0, 8)}) really touches no DB surface`)

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
