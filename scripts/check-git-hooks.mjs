#!/usr/bin/env node
/**
 * scripts/check-git-hooks.mjs — probes for the commit/push gates (M-007).
 *
 * Three properties, because a git hook has three independent ways to be decorative:
 *   1. it exists and is executable
 *   2. `core.hooksPath` actually points at the directory holding it — a hook in an unreferenced
 *      directory is a file, not a gate, and NOTHING about the file itself reveals that
 *   3. it BLOCKS (non-zero exit) when the command it wraps fails, and passes when it succeeds
 *
 * (3) is probed in both directions via the PLEKS_*_CMD seam rather than by running the real
 * two-minute chain — the property under test is "does a failure propagate", not "does the suite
 * pass", and conflating them would make this probe too slow to run and therefore not run.
 */
import { existsSync, statSync, writeFileSync, rmSync, mkdtempSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

const HOOKS = [
  { file: ".githooks/pre-commit", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
  { file: ".githooks/pre-push", env: "PLEKS_PREPUSH_CMD", wraps: "npm run check:full" },
  // Git does NOT run pre-commit for a merge. Without this hook the commit gate had a hole the
  // size of every merge commit — including the one that brought main into this branch.
  { file: ".githooks/pre-merge-commit", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
  // Measured 2026-08-19: `git cherry-pick` and `git revert` run NEITHER pre-commit NOR
  // pre-merge-commit. They do run prepare-commit-msg, which is therefore the gate for every
  // commit-creating path git does not otherwise cover — including whichever one is added next.
  { file: ".githooks/prepare-commit-msg", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
]

let failed = 0
const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

// pre-commit/pre-merge-commit record the tree they approved so prepare-commit-msg can tell "the
// gate already ran for this commit" from "no gate ran". Every probe that drives pre-commit
// successfully therefore WRITES that marker — and the next probe of prepare-commit-msg would
// consume it and skip, reporting the gate inert as if by design. Found by this suite going red the
// first time it ran. Each direction clears it first, so no probe inherits another's state.
const markerPath = () => spawnSync("git", ["rev-parse", "--git-path", "pleks-gate-ok"], { encoding: "utf8" }).stdout.trim()
const clearMarker = () => { try { rmSync(markerPath(), { force: true }) } catch { /* nothing to clear */ } }

// 2 — the wiring. Checked once, first: if this is wrong every hook below is inert.
const configured = spawnSync("git", ["config", "core.hooksPath"], { encoding: "utf8" }).stdout.trim()
ok(configured === ".githooks", `core.hooksPath is .githooks (got "${configured || "unset"}") — without this the hooks are inert files`)

for (const { file, env, wraps } of HOOKS) {
  ok(existsSync(file), `${file} exists`)
  if (!existsSync(file)) continue

  // On Windows checkouts the mode bit is often not meaningful locally, but it IS what git records
  // and what a POSIX clone will honour, so assert what git has staged rather than the filesystem.
  const mode = spawnSync("git", ["ls-files", "-s", file], { encoding: "utf8" }).stdout.trim()
  ok(mode === "" || mode.startsWith("100755"), `${file} is executable in git (${mode.split(" ")[0] || "untracked yet"})`)

  ok(statSync(file).size > 0, `${file} is not empty`)

  // 3 — both directions through the real hook, as a real process.
  // PLEKS_HOOK_PROBE=1 is required alongside the command seam. Without it the hooks ignore the
  // seam entirely and run the real chain — which is the point: `PLEKS_PRECOMMIT_CMD=true git
  // commit` was a silent, complete bypass, functionally --no-verify. The probe is the only caller
  // that legitimately sets both, so the seam now costs a deliberate act rather than one variable.
  const run = (cmd) => {
    clearMarker()
    return spawnSync("sh", [file], { encoding: "utf8", env: { ...process.env, PLEKS_HOOK_PROBE: "1", [env]: cmd } }).status
  }
  ok(run("false") !== 0, `${file} BLOCKS when "${wraps}" fails`)
  ok(run("true") === 0, `${file} passes when "${wraps}" succeeds`)
}

// The marker's own contract, both directions — it is what makes prepare-commit-msg the gate for
// cherry-pick and revert without double-running the chain on an ordinary commit.
{
  const HOOK = ".githooks/prepare-commit-msg"
  let lastOut = ""
  const drive = (cmd) => {
    const r = spawnSync("sh", [HOOK], { encoding: "utf8", env: { ...process.env, PLEKS_HOOK_PROBE: "1", PLEKS_PRECOMMIT_CMD: cmd } })
    lastOut = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim()
    return r.status
  }

  clearMarker()
  ok(drive("false") !== 0, `${HOOK}: with NO marker it runs the gate — the cherry-pick/revert path`)

  // A marker naming THIS tree means pre-commit already approved it: skip, even though the gate fails.
  const tree = spawnSync("git", ["write-tree"], { encoding: "utf8" }).stdout.trim()
  writeFileSync(markerPath(), tree)
  const skipped = drive("false") === 0
  ok(skipped, `${HOOK}: a marker for THIS tree skips the gate — no double run on a plain commit${skipped ? "" : `\n      marker=${tree} at ${markerPath()}; hook said: ${lastOut}`}`)

  // …and it is consumed, so a second commit off the same marker cannot ride it.
  ok(drive("false") !== 0, `${HOOK}: the marker is consumed — a second commit does not inherit it`)

  // A marker for a DIFFERENT tree is the aborted-commit case: it must not be honoured.
  writeFileSync(markerPath(), "0000000000000000000000000000000000000000")
  ok(drive("false") !== 0, `${HOOK}: a marker for a DIFFERENT tree is ignored — an aborted commit cannot donate its pass`)
  clearMarker()
}

// ─── The default-branch guard (M-073) ────────────────────────────────────────────────────────────
// Two occurrences (2026-08-20, 2026-08-21) of commits landing on the default branch with every
// local gate green. The guard is driven through its own seam so these cases opt IN to it, leaving
// the command-seam probes above — and `npm run check` on any branch — untouched.
{
  const HOOK = ".githooks/pre-commit"
  const drive = (branch) => {
    clearMarker()
    return spawnSync("sh", [HOOK], {
      encoding: "utf8",
      env: { ...process.env, PLEKS_HOOK_PROBE: "1", PLEKS_PRECOMMIT_CMD: "true", PLEKS_BRANCH_PROBE: branch },
    })
  }

  // Resolved the same way the hook resolves it, so the probe cannot pass by agreeing with a
  // hardcoded "main" on both sides — a repo defaulting to `master` must exercise `master` here.
  const resolved = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8" })
    .stdout.trim().replace(/^origin\//, "") || "main"

  const onDefault = drive(resolved)
  ok(onDefault.status !== 0, `${HOOK}: BLOCKS a commit on the default branch ("${resolved}")`)
  ok(/default branch/i.test(`${onDefault.stdout ?? ""}${onDefault.stderr ?? ""}`),
    `${HOOK}: says WHY it refused — a bare non-zero exit sends you looking at the check chain`)

  // It must fire BEFORE the chain: the seam here says the chain would PASS, so a failure can only
  // come from the guard. This is the property that makes the remedy one `git switch -c`.
  ok(onDefault.status !== 0, `${HOOK}: the guard runs BEFORE the check chain (chain seam is "true" and it still refused)`)

  // KNOWN-GOOD — the half that catches an over-broad guard. Without it, "block everything" passes.
  ok(drive("fix/some-feature-branch").status === 0, `${HOOK}: a normal feature branch is untouched`)
  ok(drive(`${resolved}-but-not-quite`).status === 0, `${HOOK}: matches the default branch EXACTLY, not as a prefix`)
  clearMarker()
}

// The seam must be INERT without the probe flag, or it is just --no-verify with extra steps.
//
// The first version tested this by GREPPING the hook's source for the `PLEKS_HOOK_PROBE` string and
// the `-n "$PLEKS_PRECOMMIT_CMD"` string, on pre-commit only. That is not a probe of behaviour: it
// passes on a hook whose two conditions are ORed rather than ANDed, on one that reads the flag and
// ignores the result, and on any rewrite that keeps the words and loses the logic — the exact
// "matches the text, proves nothing" shape this repo has now been bitten by repeatedly. And it left
// pre-merge-commit and prepare-commit-msg, both carrying the same seam, entirely unprobed.
//
// Behavioural instead, and cheap: every hook ECHOES the command it resolved before running it. Run
// it with the seam set and the flag ABSENT, and read the command it named. If it names the seam's
// command, the seam leaked; if it names the real chain, the seam is inert.
//
// ⚠ AND THE HOOK MUST NOT ACTUALLY RUN THAT CHAIN. The first attempt let it start `npm run check`
// and killed the shell after four seconds. On Windows the kill does not reach the descendants, and
// `npm run check` runs THIS SCRIPT — which spawned four more real chains, each spawning four more.
// It fork-bombed the machine: 58 orphaned node processes, a ten-minute hang, and a commit that
// never completed. A probe that costs more than the thing it probes does not get run, and one that
// re-enters the suite it lives in is not a probe at all.
//
// So `npm` is shimmed on PATH: the hook resolves and invokes `npm run check` for real, and the npm
// it reaches prints and exits 0. Nothing recurses, nothing is killed, and the property under test —
// which command did the hook RESOLVE — is exactly what is observed.
{
  const shimDir = mkdtempSync(join(tmpdir(), "hookshim-"))
  writeFileSync(join(shimDir, "npm"), '#!/bin/sh\necho "SHIM npm $*"\nexit 0\n', { mode: 0o755 })

  for (const { file, env } of HOOKS) {
    clearMarker()
    const withFlag = spawnSync("sh", [file], {
      encoding: "utf8",
      env: { ...process.env, PLEKS_HOOK_PROBE: "1", [env]: "true" },
    }).status
    ok(withFlag === 0, `${file}: the command seam is honoured WITH PLEKS_HOOK_PROBE=1`)

    clearMarker()
    const noFlag = spawnSync("sh", [file], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${shimDir}:${process.env.PATH}`,
        PLEKS_HOOK_PROBE: "",
        [env]: "echo SEAM-LEAKED",
      },
    })
    const out = String(noFlag.stdout ?? "")
    // pre-push prints an explanatory line before its `→ $CMD` line, so take the LAST arrow line —
    // every hook's final echo before running is the command it resolved.
    const arrows = out.split(/\r?\n/).filter((l) => l.includes("→"))
    const resolved = (arrows.at(-1) ?? "").replace(/^.*→\s*/, "").trim()
    ok(/^npm run check(:full)?$/.test(resolved) && !out.includes("SEAM-LEAKED"),
      `${file}: …and IGNORED without it — resolved "${resolved || "(no output)"}"`)
    // The shim must actually have been the thing that ran, or the assertion above is about an echo
    // and nothing else — the hook could resolve the right string and invoke something else.
    ok(out.includes("SHIM npm run check"), `${file}: …and INVOKED it — the shimmed npm was reached`)
  }
  rmSync(shimDir, { recursive: true, force: true })
}

console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — hooks exist, are wired, and block on failure")
process.exit(failed ? 1 : 0)
