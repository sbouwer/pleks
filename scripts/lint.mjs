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
 *
 * PARALLEL, not cached, is how CI gets faster (2026-10-09). CI's Lint & Typecheck job took ~6m, of which
 * tsc + uncached ESLint were one 225s stretch. `--concurrency` (ESLint ≥ 9.34; this repo is on 10) lints
 * every file with every rule, split across worker threads — coverage unchanged, unlike a cache.
 * Measured uncached on this repo: serial 150s, 4 workers 69s, same clean result — on a 24-core desktop.
 * On the 4-vCPU hosted runner it saved only ~25s (225s → 200s for tsc + lint, job 113783832236); the
 * bigger CI cut came from splitting the job (scripts/ci-partition.mjs).
 * Safe because no `pleks/*` rule shares state ACROSS files: their module-level Sets are read-only
 * baselines each worker loads for itself, and the one `Program:exit` (require-audit-on-sensitive-mutation)
 * is per-file. A rule that ever aggregates across files (e.g. reporting unused baseline entries) would
 * see only its worker's share — that rule belongs in a script, not here.
 * Capped at 4: GitHub's hosted runner has 4 vCPUs, and typed linting (projectService) builds a TS
 * program PER worker, so memory scales with the count.
 * UNCACHED PATHS ONLY. On a warm local cache the workers cost more than they save (12s against 6-10s
 * serial, measured the same day) and ESLint itself warns ESLintPoorConcurrencyWarning — almost every
 * file is a cache hit, so the threads start for nothing.
 */
import { spawnSync } from "node:child_process"
import { availableParallelism } from "node:os"

const inCI = Boolean(process.env.CI)
const args = [".", "--max-warnings", "0"]
const parallel = ["--concurrency", String(Math.min(4, availableParallelism()))]

if (!inCI) {
  const g = spawnSync(process.execPath, ["scripts/eslint-cache-guard.mjs"], { stdio: "inherit" })
  // A guard that cannot run must not silently downgrade to an unguarded cache — fall back to the
  // uncached path instead, which is slower and always correct.
  if (g.status !== 0) {
    console.log("[lint] cache guard failed — running UNCACHED rather than trusting a cache it did not verify")
    process.exit(spawnSync("npx", ["eslint", ...args, ...parallel], { stdio: "inherit", shell: true }).status ?? 1)
  }
  args.push("--cache", "--cache-location", ".eslintcache")
} else {
  args.push(...parallel)
}

process.exit(spawnSync("npx", ["eslint", ...args], { stdio: "inherit", shell: true }).status ?? 1)
