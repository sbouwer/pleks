#!/usr/bin/env node
/**
 * scripts/check-scope.mjs — the commit gate's scope: which steps of `npm run check` a staged diff selects (M-007 rung 1).
 *
 * Usage:  node scripts/check-scope.mjs            print the plan for the current index
 *         node scripts/check-scope.mjs --run      print it, then run it (what `npm run check:scoped` does)
 *         node scripts/check-scope.mjs --selftest probes, both directions
 *
 * WHY: the commit gate ran the whole push-rung chain on every commit (~116s warm, measured 2026-10-02 —
 * .handoff/gate-split/01-timings.md). The prepush-scope ruling applies one rung down: the commit rung runs what
 * the staged diff can affect. **Push and CI are unchanged** — pre-push still runs the full `check` (and the DB
 * tier when selected), and CI runs everything on the PR. A step skipped here is skipped for one commit, never
 * for what reaches origin.
 *
 * THE MAP is keyed by the exact command strings of package.json's `check`, and the selftest fails if the two
 * ever disagree in either direction — a new step with no entry, or an entry for a step that is gone. Each entry
 * is one of:
 *   "universal"  runs on every scoped plan: cheap, or reads inputs a path list cannot bound (the untracked
 *                brief/ tree, every tracked text file, data-driven page lists, the import graph of one module)
 *   "full"       never in a scoped plan: check-test-floor (it exists to fail a run that collected fewer tests
 *                than the floor, which a scoped vitest does by design), and selftests whose only input is their
 *                own source — which lives under scripts/** and therefore already forces the full chain
 *   [globs]      runs when any changed path matches. A selftest shares its checker's entry, so it runs with it.
 *
 * FALLS THROUGH TO FULL — fail toward more checking, the prepush-scope rule:
 *   · no merge-base (no origin/HEAD, a shallow clone, a detached HEAD)
 *   · any change under scripts/** (the map itself, and every .mjs/.mts the chain runs), .claude/hooks/**, .githooks/**
 *   · a CONFIG file (package.json, the lockfile, tsconfig*, eslint/vitest/next/postcss configs, knip.jsonc,
 *     .nvmrc, vercel.json): a config change can change what every step means. CONFIG is checked BEFORE the
 *     map, because the source globs (`**\/*.ts`, `**\/*.mjs`) would otherwise select vitest.config.ts and
 *     eslint.config.mjs and turn a chain change into a scoped run. The selftest holds every one of them.
 *   · any path no entry selects and that is not INERT
 * INERT is `**\/*.md` and `docs/**` — paths that select the universal set only, unless a checker selects them
 * (CLAUDE.md, docs/MECHANISABLE.md and .claude/**\/*.md are selected, so they are not "docs-only").
 *
 * THE DIFF IS THE INDEX, not the working tree: a commit commits what is staged. `git diff --cached -M
 * --name-status <merge-base>` — both sides of a rename, and deletions (a deleted file still selects the
 * checkers that guarded it). The steps then run against the working tree, as the full chain always has.
 *
 * vitest: the full chain's `vitest run` writes node_modules/.vitest-count.json for check-test-floor. A scoped
 * plan never writes it. When every changed path is source or inert, vitest runs `related --run` on the staged
 * source files that still exist (vitest follows static and dynamic imports to the tests). Anything else
 * selected — SQL, JSON, a fixture a test reads through fs, which no import graph shows — runs the whole suite.
 */
import { execSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { posix, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const SRC = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
const TS = "**/*.{ts,tsx,mts,cts}"
const VITEST_FULL = "vitest run --reporter=default --reporter=json --outputFile.json=node_modules/.vitest-count.json"

/** Command → selection. Order is irrelevant here; plans follow the chain's order. */
export const MAP = {
  "node scripts/check-deps-installed.mjs": "universal",
  "node scripts/check-deps-installed.mjs --selftest": "universal",
  "node scripts/check-install-platform.mjs": "universal",
  "node scripts/check-install-platform.mjs --selftest": "universal",
  "tsc --noEmit": [TS], // incremental: tsconfig.json sets "incremental", tsconfig.tsbuildinfo persists
  "node scripts/lint.mjs": [SRC, "eslint-rules/**"],
  "node scripts/check-legal-localhost.mjs": ["app/(public)/**", "components/legal/**"],
  "node scripts/check-marketing-consistency.mjs": ["app/(public)/**", "components/marketing/**", "lib/marketing/**"],
  // Reads the surfaces each claim names (data-driven) plus an import tree: no path list bounds it. 0.6s.
  "tsx scripts/check-retention-claims.mts": "universal",
  "tsx scripts/check-retention-skiplist.mts --selftest": ["supabase/migrations/**", "lib/subscriptions/**"],
  "tsx scripts/check-retention-skiplist.mts": ["supabase/migrations/**", "lib/subscriptions/**"],
  "node scripts/architecture-audit.mjs": "universal", // walks the whole tree for hardcoded URLs
  "node scripts/schema-contract-scan.mjs": [TS, "supabase/migrations/**"],
  "node scripts/check-audit-columns.mjs": [TS],
  "node scripts/check-import-fields.mjs": ["lib/import/**", "app/(dashboard)/settings/import/**"],
  "node scripts/check-server-action-exports.mjs": [TS],
  "node scripts/check-csv-escaping.mjs": [TS],
  "node scripts/check-file-headers.mjs": ["**/*.{ts,tsx,yml,yaml}"],
  "node scripts/check-rules-tracked.mjs": [".claude/**"],
  "node scripts/check-import-cycles.mjs": [TS],
  "node scripts/check-import-cycles.mjs --selftest": [TS],
  "node scripts/check-knip-floor.mjs": [SRC],
  "node scripts/check-knip-floor.mjs --selftest": [SRC],
  // Reads only .releaserc.json, which is CONFIG and forces full: never in a scoped plan.
  "node scripts/check-release-health.mjs --selftest": "full",
  "node scripts/check-release-health.mjs --config": "full",
  // Reads MECHANISABLE.md plus every path its tags name (scripts, hooks, rules, workflows, test files).
  "node scripts/check-register-integrity.mjs": "universal",
  "node scripts/check-register-integrity.mjs --selftest": "universal",
  "node scripts/check-extension-stem-pairs.mjs": "universal", // whole-tree name pairs
  "node scripts/check-extension-stem-pairs.mjs --selftest": "universal",
  "node scripts/check-subscription-single-reads.mjs": ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  "node scripts/check-subscription-single-reads.mjs --selftest": ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  "node scripts/check-invariant-has-callers.mjs": ["{app,lib,components}/**/*.{ts,tsx}"],
  "node scripts/check-invariant-has-callers.mjs --selftest": ["{app,lib,components}/**/*.{ts,tsx}"],
  "node scripts/transcript-metrics.mjs --selftest": "full",
  "node scripts/check-migration-forward-refs.mjs": ["supabase/migrations/**"],
  "node scripts/check-migration-integrity.mjs": ["supabase/migrations/**", ".claude/rules/identity-scoped-tables.md"],
  "node scripts/check-migration-integrity.mjs --selftest": ["supabase/migrations/**", ".claude/rules/identity-scoped-tables.md"],
  "node scripts/check-auth-users-on-conflict.mjs": ["**/*.sql", SRC],
  "node scripts/check-auth-users-on-conflict.mjs --selftest": ["**/*.sql", SRC],
  "node scripts/check-drift-if-sql-changed.mjs --selftest": "full",
  "node scripts/check-workflow-secrets.mjs": [".github/**"],
  // Reads CLAUDE.md, the register, rules, hooks, settings, workflows, eslint rules, the script chain, and the
  // test files its `test:` tags name — anywhere in the tree.
  "node scripts/check-claude-md.mjs": "universal",
  "node scripts/check-claude-md.mjs --selftest": "universal",
  "node scripts/check-mention-fixtures.mjs --selftest": "full", // reads and runs scripts/** only
  "node scripts/check-mention-fixtures.mjs": "full",
  "node scripts/check-mojibake.mjs --selftest": "universal", // every tracked text file
  "node scripts/check-mojibake.mjs": "universal",
  "tsx scripts/security/check-pii-classification.mts": "universal", // anonymisePlan.ts and its import tree
  "node scripts/check-bash-gate.mjs": [".claude/hooks/**", ".githooks/**"],
  "node scripts/check-context-budget.mjs": [".claude/hooks/**", ".claude/settings.json"],
  "node scripts/check-statusline.mjs": [".claude/statusline.js", ".claude/settings.json"],
  "node scripts/agent-distribution.mjs --selftest": [".claude/agents/**"],
  "node scripts/check-mcp-ddl-gate.mjs": [".claude/hooks/**"],
  "node scripts/check-agent-write-scope.mjs": [".claude/hooks/**", ".claude/settings.json"],
  "node .claude/hooks/agent-write-scope.probe.mjs": [".claude/hooks/**", ".claude/settings.json"],
  "node .claude/hooks/agent-brief-gate.probe.mjs": [".claude/hooks/**", ".claude/settings.json"],
  "node scripts/check-handoff-contract.mjs": [".handoff/**", ".claude/agents/**"],
  "node scripts/check-handoff-contract.mjs --selftest": [".handoff/**", ".claude/agents/**"],
  "node scripts/check-commands.mjs --selftest": [".claude/commands/**", ".claude/agents/**"],
  "node scripts/check-commands.mjs": [".claude/commands/**", ".claude/agents/**"],
  "node scripts/check-hook-registration.mjs": [".claude/hooks/**", ".claude/settings.json"],
  "node scripts/check-hook-registration.mjs --selftest": [".claude/hooks/**", ".claude/settings.json"],
  // Reads brief/ — an untracked OneDrive symlink no git diff can show.
  "node scripts/delivery-report.mjs --selftest": "universal",
  "node scripts/delivery-report.mjs --check": "universal",
  "node scripts/check-git-hooks.mjs": [".githooks/**"],
  "node scripts/prepush-scope.mjs --selftest": "full",
  "node scripts/check-prepush-composition.mjs": [".githooks/**"],
  "node scripts/eslint-cache-guard.mjs --selftest": "full",
  "node scripts/check-scope.mjs --selftest": "full",
  "node scripts/check-test-floor.mjs --selftest": "full",
  [VITEST_FULL]: [SRC, "**/*.{sql,yml,yaml,csv,txt,html,xml}", "**/__fixtures__/**", "**/__tests__/**"],
  "node scripts/check-test-floor.mjs": "full",
}

/** Any change here means the chain itself changed: run all of it. */
const FORCE_FULL = ["scripts/**", ".claude/hooks/**", ".githooks/**"]
/** Configuration: changes what the steps mean. Wins over every map entry. */
export const CONFIG = [
  "package.json", "package-lock.json", "tsconfig*.json", "knip.jsonc", ".nvmrc", ".npmrc", "vercel.json", "next-env.d.ts",
  "*.config.{ts,mts,cts,js,mjs,cjs}", "eslint.config.*", "vitest*.config.*", ".releaserc.json",
]
/** Selects the universal set and nothing else, unless an entry selects the path too. */
const INERT = ["**/*.md", "docs/**"]

const matches = (file, globs) => globs.some((g) => posix.matchesGlob(file, g))
const isSource = (f) => matches(f, [SRC])

export function chainCommands(pkgJson) {
  return JSON.parse(pkgJson).scripts.check.split(" && ").map((s) => s.trim())
}

/**
 * Pure: the plan for a set of changed paths. `files === null` means the diff could not be bounded.
 * Returns { full, reason, commands }; a full plan's commands are the chain unchanged.
 */
export function plan(chain, files) {
  const full = (reason) => ({ full: true, reason, commands: chain })
  if (files === null) return full("no merge-base — the diff cannot be bounded")
  const forced = files.find((f) => matches(f, FORCE_FULL))
  if (forced) return full(`${forced} is part of the gate itself`)
  const cfg = files.find((f) => matches(f, CONFIG))
  if (cfg) return full(`${cfg} is configuration`)
  const unknown = chain.filter((c) => !(c in MAP))
  if (unknown.length) return full(`not in the scope map: ${unknown[0]}`)
  const selected = (f) => Object.values(MAP).some((v) => Array.isArray(v) && matches(f, v))
  const loose = files.find((f) => !selected(f) && !matches(f, INERT))
  if (loose) return full(`${loose} is selected by no step and is not inert`)

  const out = []
  for (const cmd of chain) {
    const sel = MAP[cmd]
    if (sel === "full") continue
    if (sel !== "universal" && !files.some((f) => matches(f, sel))) continue
    if (cmd === VITEST_FULL) {
      const src = files.filter(isSource)
      if (files.every((f) => isSource(f) || matches(f, INERT))) {
        const live = src.filter((f) => existsSync(f))
        if (live.length) out.push(`vitest related --run --passWithNoTests ${live.map((f) => JSON.stringify(f)).join(" ")}`)
      } else {
        out.push("vitest run") // whole suite, no count file: the floor reads that file and never runs scoped
      }
      continue
    }
    out.push(cmd)
  }
  return { full: false, reason: `${files.length} staged path(s)`, commands: out }
}

/** Staged paths against the merge-base with the default branch; null when there is none to diff against. */
export function stagedFiles() {
  const git = (c) => execSync(c, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  try {
    if (git("git rev-parse --is-shallow-repository") === "true") return null
    git("git symbolic-ref -q HEAD") // throws on a detached HEAD
    const def = git("git symbolic-ref --quiet --short refs/remotes/origin/HEAD")
    const base = git(`git merge-base HEAD ${def}`)
    const raw = git(`git diff --cached -M --name-status -z ${base}`)
    const parts = raw.split("\0").filter(Boolean)
    const files = []
    for (let i = 0; i < parts.length; ) {
      const status = parts[i++]
      const n = /^[RC]/.test(status) ? 2 : 1 // a rename or copy carries both sides
      for (let k = 0; k < n; k++) files.push(parts[i++])
    }
    return [...new Set(files)]
  } catch {
    return null
  }
}

/** Runs a plan in order, stopping at the first failure. `run` is the seam the selftest drives. */
export function execute(p, run) {
  for (const cmd of p.commands) {
    if (run(cmd) !== 0) return { ok: false, failed: cmd }
  }
  return { ok: true, failed: null }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invoked && process.argv.includes("--selftest")) {
  const chain = chainCommands(readFileSync("package.json", "utf8"))
  let failed = 0
  const ok = (cond, label, extra = "") => {
    if (!cond) failed++
    console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !extra ? "" : `\n      ${extra}`}`)
  }
  const universal = chain.filter((c) => MAP[c] === "universal")
  const has = (p, needle) => p.commands.some((c) => c.includes(needle))

  // The map and the chain agree, both directions.
  const missing = chain.filter((c) => !(c in MAP))
  ok(missing.length === 0, "every step of `check` is in the scope map", `missing: ${missing.join(" | ")}`)
  const stale = Object.keys(MAP).filter((c) => !chain.includes(c))
  ok(stale.length === 0, "every map entry is a step of `check` — no stale entries", `stale: ${stale.join(" | ")}`)
  ok(plan([...chain, "node scripts/check-new-thing.mjs"], ["lib/a.ts"]).full, "PLANTED: a step added to `check` with no map entry forces full")

  // Docs-only means a path NO entry selects — not docs/**, which holds MECHANISABLE.md.
  const docs = plan(chain, ["docs/handovers/some-note.md"])
  ok(!docs.full && JSON.stringify(docs.commands) === JSON.stringify(universal), "a docs-only diff yields exactly the universal set", JSON.stringify(docs))
  ok(!plan(chain, ["CLAUDE.md"]).full, "CLAUDE.md is scoped (check-claude-md is universal), not full")

  const sb = plan(chain, ["supabase/migrations/005_operations.sql"])
  ok(!sb.full && ["check-migration-forward-refs", "check-migration-integrity.mjs", "check-migration-integrity.mjs --selftest", "check-retention-skiplist", "schema-contract-scan", "check-auth-users-on-conflict"].every((n) => has(sb, n)),
    "a supabase/ migration diff includes the migration set", JSON.stringify(sb.commands))
  ok(has(sb, "vitest run") && !has(sb, "vitest related"), "a non-source diff runs the WHOLE vitest suite — a test may read the file through fs")

  ok(plan(chain, ["scripts/check-scope.mjs"]).full, "a diff touching the map itself yields full")
  ok(plan(chain, ["scripts/security/audit.mjs"]).full, "scripts/** (not only scripts/*.mjs) yields full — .mts checks live under scripts/security")
  ok(plan(chain, [".githooks/pre-commit"]).full, ".githooks/** yields full")
  ok(plan(chain, [".claude/hooks/bash-gate.js"]).full, ".claude/hooks/** yields full")

  // Config files fall through to full because NO entry selects them — and must stay that way.
  for (const cfg of ["package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "vitest.config.ts", "vitest.db.config.ts", "knip.jsonc", "next.config.ts", ".releaserc.json"]) {
    const p = plan(chain, [cfg, "docs/x.md"])
    ok(p.full && / is configuration/.test(p.reason), `${cfg} yields full, even beside a docs change`, p.reason)
  }
  // The trap the CONFIG list exists for: the source globs DO match these files, so without the list they
  // would be scoped. Assert the globs still match, so this probe keeps meaning something.
  ok(matches("vitest.config.ts", MAP["tsc --noEmit"]) && matches("eslint.config.mjs", MAP["node scripts/lint.mjs"]),
    "KNOWN-HAZARD: tsc/lint globs match vitest.config.ts and eslint.config.mjs — CONFIG must outrank the map")
  ok(!matches("lib/screening/package.json.ts", CONFIG), "KNOWN-GOOD: CONFIG matches root files exactly, not a source file that merely contains the name")
  ok(plan(chain, ["lib/searchworx/rates/__fixtures__/pricelist.csv"]).full === false &&
     has(plan(chain, ["lib/searchworx/rates/__fixtures__/pricelist.csv"]), "vitest run"), "a test fixture runs the whole suite")
  ok(plan(chain, ["supabase/config.toml"]).full, "an unmatched, non-inert path yields full")

  ok(plan(chain, null).full, "no merge-base yields full")

  // check-test-floor never follows a scoped vitest; the count file is never written by a scoped run.
  const samples = [["lib/dates/index.ts"], ["app/(public)/pricing/page.tsx", "docs/x.md"], ["supabase/migrations/005_operations.sql"], [".claude/agents/scout.md"], ["docs/x.md"], [".github/workflows/ci.yml"]]
  const scoped = samples.map((s) => plan(chain, s)).filter((p) => !p.full)
  ok(scoped.length === samples.length, "every sample diff is scoped (none fell through)")
  ok(scoped.every((p) => !has(p, "check-test-floor")), "a scoped plan never contains check-test-floor")
  ok(scoped.every((p) => !has(p, ".vitest-count.json")), "a scoped plan never writes .vitest-count.json")

  const feat = plan(chain, ["lib/dates/index.ts"])
  ok(has(feat, "tsc --noEmit") && has(feat, "lint.mjs") && has(feat, "vitest related --run"), "an ordinary source diff runs tsc, lint and the related tests", JSON.stringify(feat.commands))
  ok(!has(feat, "check-git-hooks") && !has(feat, "check-bash-gate"), "KNOWN-GOOD: a source diff does not run the hook probes")

  // Renames: both sides select.
  ok(has(plan(chain, ["app/(public)/old/page.tsx", "docs/moved.md"]), "check-legal-localhost"), "the OLD side of a rename still selects its checkers")

  // The seam: the plan's runner decides the exit, step by step.
  const lintFails = (c) => (c.includes("lint.mjs") ? 1 : 0)
  ok(!execute(feat, lintFails).ok, "a staged file whose selected checker fails BLOCKS (planted lint failure)")
  ok(execute(feat, () => 0).ok, "KNOWN-GOOD: a clean tree passes")
  ok(execute(docs, lintFails).ok, "a failing checker the diff does NOT select does not decide a docs-only commit")
  ok(!plan(chain, ["lib/dates/index.ts"]).full, "an unstaged scripts/ edit does not decide the scope — only the index is read (plan takes staged paths)")

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — scopes by staged diff, falls through to full on the gate, config or the unknown")
  process.exit(failed ? 1 : 0)
}

if (invoked) main()

function main() {
const chain = chainCommands(readFileSync("package.json", "utf8"))
const files = stagedFiles()
const p = plan(chain, files)
const t0 = Date.now()
console.log(p.full ? `check:scoped → FULL chain (${p.reason})` : `check:scoped → ${p.commands.length} of ${chain.length} steps for ${p.reason}`)
if (!process.argv.includes("--run")) {
  for (const c of p.commands) console.log(`  ${c}`)
  process.exit(0)
}
if (p.full) process.exit(spawnSync("npm run check", { stdio: "inherit", shell: true }).status ?? 1)
const r = execute(p, (cmd) => spawnSync(cmd, { stdio: "inherit", shell: true }).status ?? 1)
console.log(r.ok ? `check:scoped → passed in ${((Date.now() - t0) / 1000).toFixed(1)}s` : `check:scoped → FAILED at: ${r.failed}`)
process.exit(r.ok ? 0 : 1)
}
