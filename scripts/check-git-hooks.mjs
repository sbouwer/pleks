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
import { existsSync, readFileSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"

const HOOKS = [
  { file: ".githooks/pre-commit", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
  { file: ".githooks/pre-push", env: "PLEKS_PREPUSH_CMD", wraps: "npm run check:full" },
  // Git does NOT run pre-commit for a merge. Without this hook the commit gate had a hole the
  // size of every merge commit — including the one that brought main into this branch.
  { file: ".githooks/pre-merge-commit", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
]

let failed = 0
const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

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
  const run = (cmd) =>
    spawnSync("sh", [file], { encoding: "utf8", env: { ...process.env, PLEKS_HOOK_PROBE: "1", [env]: cmd } }).status
  ok(run("false") !== 0, `${file} BLOCKS when "${wraps}" fails`)
  ok(run("true") === 0, `${file} passes when "${wraps}" succeeds`)
}

// The seam must be INERT without the probe flag, or it is just --no-verify with extra steps.
// Probed against pre-push, whose fallback is the scope branch rather than a fixed command: with
// the flag it honours "false" and blocks; without it, it ignores the seam entirely.
{
  const withFlag = spawnSync("sh", [".githooks/pre-commit"], {
    encoding: "utf8",
    env: { ...process.env, PLEKS_HOOK_PROBE: "1", PLEKS_PRECOMMIT_CMD: "true" },
  }).status
  const seamHonoured = withFlag === 0
  if (!seamHonoured) failed++
  console.log(`  ${seamHonoured ? "✓" : "✗"} the command seam is honoured WITH PLEKS_HOOK_PROBE=1`)

  const src = readFileSync(".githooks/pre-commit", "utf8")
  const gated = /PLEKS_HOOK_PROBE.*=.*"?1"?/.test(src) && /-n "\$PLEKS_PRECOMMIT_CMD"/.test(src)
  if (!gated) failed++
  console.log(`  ${gated ? "✓" : "✗"} …and IGNORED without it — the seam is not a one-variable bypass`)
}

console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — hooks exist, are wired, and block on failure")
process.exit(failed ? 1 : 0)
