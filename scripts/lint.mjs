#!/usr/bin/env node
/**
 * scripts/lint.mjs — run ESLint, cached locally, uncached in CI.
 *
 * Measured 2026-08-19 on this repo: `eslint . --max-warnings 0` is 115s of the ~132s `npm run
 * check` chain — 87% of it. tsc is 7s and the whole vitest run is ~8s, so lint is the ONLY stage
 * worth optimising; selecting tests by diff would have bought ~8s of ~132.
 *
 *   uncached            115.0s
 *   cached, warm          4.0s
 *   cached, cold        151.8s   (a ~37s premium to build it)
 *
 * CI gets a fresh runner every time, so its cache is always cold — caching there would pay the
 * premium and throw the result away. It therefore runs uncached, which also means **the full,
 * uncached lint still happens on every PR**. That is what makes the local cache a latency
 * optimisation rather than a coverage decision — the same argument that justified moving the DB
 * tier off the local pre-push path.
 *
 * Cache correctness is NOT ESLint's own: see scripts/eslint-cache-guard.mjs. A dozen `pleks/*`
 * rules read baselines that ESLint's cache cannot see, so the guard drops the cache whenever a
 * rule, a baseline, or the config changes.
 */
import { spawnSync } from "node:child_process"

const inCI = Boolean(process.env.CI)
const args = [".", "--max-warnings", "0"]

if (!inCI) {
  const g = spawnSync(process.execPath, ["scripts/eslint-cache-guard.mjs"], { stdio: "inherit" })
  // A guard that cannot run must not silently downgrade to an unguarded cache — fall back to the
  // uncached path instead, which is slower and always correct.
  if (g.status !== 0) {
    console.log("[lint] cache guard failed — running UNCACHED rather than trusting a cache it did not verify")
    process.exit(spawnSync("npx", ["eslint", ...args], { stdio: "inherit", shell: true }).status ?? 1)
  }
  args.push("--cache", "--cache-location", ".eslintcache")
}

process.exit(spawnSync("npx", ["eslint", ...args], { stdio: "inherit", shell: true }).status ?? 1)
