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
import { existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"

const HOOKS = [
  { file: ".githooks/pre-commit", env: "PLEKS_PRECOMMIT_CMD", wraps: "npm run check" },
  { file: ".githooks/pre-push", env: "PLEKS_PREPUSH_CMD", wraps: "npm run check:full" },
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
  const run = (cmd) => spawnSync("sh", [file], { encoding: "utf8", env: { ...process.env, [env]: cmd } }).status
  ok(run("false") !== 0, `${file} BLOCKS when "${wraps}" fails`)
  ok(run("true") === 0, `${file} passes when "${wraps}" succeeds`)
}

console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — hooks exist, are wired, and block on failure")
process.exit(failed ? 1 : 0)
