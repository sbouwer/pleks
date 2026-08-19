#!/usr/bin/env node
/**
 * scripts/eslint-cache-guard.mjs — make ESLint's cache safe for THIS repo's custom rules.
 *
 * ESLint's cache keys on each file's own content plus the resolved config. That is sound for
 * stock rules and WRONG here, because a dozen `pleks/*` rules read state that lives OUTSIDE the
 * file being linted:
 *
 *   - `eslint-rules/*.baseline.json` — the grandfathered-violation lists
 *   - `eslint-rules/*.mjs`           — the rule implementations themselves
 *
 * The failure is not hypothetical, and it lands on the routine workflow. Remove a file from
 * `no-cookie-client-from.baseline.json` as part of the burndown: that file's OWN content has not
 * changed, so ESLint replays its cached result, the newly-unbaselined violation is never
 * reported, and a green gate has checked nothing. That is the "instrument reports safety it did
 * not verify" class (LESSONS L-01/L-06) with a cache as the mechanism.
 *
 * So: hash everything the rules depend on, and drop the cache whenever that hash moves. The cache
 * then accelerates only the case it is actually sound for — source edits with fixed rules.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE RESIDUE THIS GUARD DOES **NOT** CLOSE, AND THE AUTHORITY THAT DOES
 *
 * `eslint.config.mjs` sets `parserOptions.projectService: true` — linting here is TYPE-AWARE.
 * That breaks the cache's dependency model in a way no hash can fix: changing an exported type in
 * `lib/foo.ts` can change the lint result for `app/bar.ts` while `bar.ts` itself is untouched, so
 * ESLint replays a stale result for it. ESLint documents `--cache` as unsound for precisely this.
 * The real dependency set is the type graph, and the type graph is not hashable in practice.
 *
 * **The bounding authority is CI: it lints UNCACHED on every PR** (fresh runner, `.eslintcache`
 * gitignored, and `scripts/lint.mjs` skips the cache when `CI` is set). So the residue is
 * "a type-only defect may not surface until the PR" — not "may never surface".
 *
 * That sentence is the point of this block. A speed optimisation that SKIPS work is a control,
 * and the only thing making it safe is an unconditional authority that re-does the work
 * elsewhere. Name the authority in the file and the skip is bounded; omit it and "fast" and "ran
 * nothing" look identical. `scripts/prepush-scope.mjs` states its authority (CI's `db-tests` job);
 * this file previously did not, which was an asymmetry rather than a difference in risk.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Probe-first, both directions: `--selftest`.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const CACHE = ".eslintcache"
const KEY = ".eslintcache.key"

/**
 * Every file whose content can change a lint RESULT without changing the linted file.
 *
 * `package-lock.json`: an ESLint or plugin upgrade changes results with no edit to config or
 * rules — exactly the class this file exists to prevent, arriving through the dependency tree
 * instead of the rule tree. `tsconfig.json`: it configures the type-aware parser, so it is the
 * hashable half of the type surface described in the header.
 */
export function dependencyFiles(root) {
  const out = []
  for (const f of ["eslint.config.mjs", "package-lock.json", "tsconfig.json"]) {
    const p = join(root, f)
    if (existsSync(p)) out.push(p)
  }
  for (const e of existsSync(root) ? readdirSync(root) : []) {
    if (/^tsconfig\..*\.json$/.test(e)) out.push(join(root, e))
  }
  const dir = join(root, "eslint-rules")
  if (existsSync(dir)) {
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e)
        if (statSync(p).isDirectory()) walk(p)
        else out.push(p)
      }
    }
    walk(dir)
  }
  return [...new Set(out)].sort()
}

/**
 * Content hash. The path is included so a rename alone invalidates, and it is taken RELATIVE TO
 * ROOT: absolute paths differ per machine (and would make the key useless across checkouts),
 * while the last-two-segments shortcut this used at first is collision-prone the moment a
 * subdirectory appears.
 */
export function computeKey(files, root) {
  const h = createHash("sha256")
  const rel = (f) => f.replace(/\\/g, "/").replace(`${root.replace(/\\/g, "/")}/`, "")
  for (const f of files) {
    h.update(rel(f))
    h.update(readFileSync(f))
  }
  return h.digest("hex")
}

/**
 * The dependency set above is a HAND-WRITTEN ROOT LIST, and the probes can only prove the guard
 * reacts to files it already knows about — never that the list is complete. That is L-11's shape
 * (asserting of the population what was verified of a sample), so it gets an actual assertion:
 * every `readFileSync` inside a rule must resolve relative to the rule's own directory and must
 * not escape it. Verified 2026-08-19: all reads are `join(here, "<name>.baseline.json")`.
 *
 * A rule reading anything else means the hash cannot see that input, so the cache is unsound —
 * and the response is to LINT UNCACHED, not to hard-fail. Failing toward more work is the same
 * posture prepush-scope takes on an unknown diff.
 */
export function dependencySetTrustworthy(root) {
  const dir = join(root, "eslint-rules")
  if (!existsSync(dir)) return { ok: true, reasons: [] }
  const reasons = []
  for (const e of readdirSync(dir)) {
    if (!e.endsWith(".mjs")) continue
    const src = readFileSync(join(dir, e), "utf8")
    // Paren-BALANCED extraction. A naive /readFileSync\(([^)]*)\)/ stops at the first ")", which
    // truncates the real shape — join(dirname(fileURLToPath(import.meta.url)), "x.json") — right
    // before its anchor, so every legitimate read reads as unanchored. That false positive marked
    // the whole set untrusted and silently disabled the cache: the optimisation still "worked",
    // it just never applied, which is the failure mode that looks like success.
    for (const m of src.matchAll(/readFileSync\(/g)) {
      let depth = 0
      let i = m.index + m[0].length - 1
      for (; i < src.length; i++) {
        if (src[i] === "(") depth++
        else if (src[i] === ")" && --depth === 0) break
      }
      const arg = src.slice(m.index + m[0].length, i)
      const anchored = /\bhere\b|fileURLToPath\(\s*import\.meta\.url\s*\)|import\.meta\.dirname/.test(arg)
      if (!anchored || arg.includes("..")) {
        reasons.push(`eslint-rules/${e}: reads a path the guard cannot hash — ${arg.replace(/\s+/g, " ").slice(0, 70)}`)
      }
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** Drop the cache iff the dependency hash moved. Returns what it did, for the probe. */
export function guard(root) {
  const cachePath = join(root, CACHE)

  // Completeness first: if a rule reads something unhashable, no key is meaningful.
  const trust = dependencySetTrustworthy(root)
  if (!trust.ok) {
    if (existsSync(cachePath)) rmSync(cachePath)
    return { action: "untrusted", reasons: trust.reasons, files: 0 }
  }

  const files = dependencyFiles(root)
  const key = computeKey(files, root)
  const keyPath = join(root, KEY)
  const prev = existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : null

  if (prev === key) return { action: "kept", key, files: files.length }

  if (existsSync(cachePath)) rmSync(cachePath)
  writeFileSync(keyPath, key)
  return { action: prev === null ? "initialised" : "invalidated", key, files: files.length }
}

if (process.argv.includes("--selftest")) {
  const tmp = mkdtempSync(join(tmpdir(), "eslint-guard-"))
  mkdirSync(join(tmp, "eslint-rules"), { recursive: true })
  const cfg = join(tmp, "eslint.config.mjs")
  const base = join(tmp, "eslint-rules", "x.baseline.json")
  const rule = join(tmp, "eslint-rules", "x.mjs")
  writeFileSync(cfg, "export default []\n")
  writeFileSync(base, '["a.ts"]\n')
  writeFileSync(rule, "export default {}\n")

  const cache = join(tmp, CACHE)
  const seedCache = () => writeFileSync(cache, "stale-results")
  let failed = 0
  const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

  ok(guard(tmp).action === "initialised", "first run initialises the key")

  seedCache()
  ok(guard(tmp).action === "kept" && existsSync(cache), "no dependency change KEEPS the cache")

  // The case that motivated this file: a baseline shrinks, no source file changes.
  seedCache()
  writeFileSync(base, "[]\n")
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a baseline edit DROPS the cache")

  seedCache()
  writeFileSync(rule, "export default { meta: {} }\n")
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a rule-implementation edit DROPS the cache")

  seedCache()
  writeFileSync(cfg, "export default [{}]\n")
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a config edit DROPS the cache")

  // Both directions: having proven it fires, prove it stays quiet.
  seedCache()
  ok(guard(tmp).action === "kept" && existsSync(cache), "a settled tree keeps the cache again")

  // A new baseline appearing must invalidate — otherwise a rule gains a baseline silently.
  seedCache()
  writeFileSync(join(tmp, "eslint-rules", "y.baseline.json"), "[]\n")
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a NEW baseline file DROPS the cache")

  // A toolchain upgrade changes results with no edit to config or rules.
  writeFileSync(join(tmp, "package-lock.json"), '{"lockfileVersion":3}\n')
  writeFileSync(join(tmp, "tsconfig.json"), "{}\n")
  guard(tmp) // absorb the two new files into the key
  seedCache()
  writeFileSync(join(tmp, "package-lock.json"), '{"lockfileVersion":3,"x":1}\n')
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a package-lock change DROPS the cache (plugin upgrade)")

  seedCache()
  writeFileSync(join(tmp, "tsconfig.json"), '{"compilerOptions":{}}\n')
  ok(guard(tmp).action === "invalidated" && !existsSync(cache), "a tsconfig change DROPS the cache (type-aware parser config)")

  ok(dependencyFiles(tmp).length === 6, `enumerates every dependency file (got ${dependencyFiles(tmp).length}, want 6)`)

  // ── completeness: the hand-written root list cannot prove itself (L-11) ──
  seedCache()
  ok(dependencySetTrustworthy(tmp).ok, "KNOWN-GOOD: an anchored join(here, …) read is trusted")

  // THE REAL SHAPE, verbatim from eslint-rules/no-cookie-client-from.mjs. The first version of
  // this check flagged it — a naive regex truncated the argument at the first ")", before the
  // anchor. Every fixture passed because they were all flat single-paren forms no rule uses:
  // verified of a sample, asserted of the population (L-11). This fixture IS the population.
  writeFileSync(join(tmp, "eslint-rules", "real.mjs"),
    'import { readFileSync } from "node:fs"\n' +
    'const B = new Set(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "real.baseline.json"), "utf8")))\n')
  const realShape = dependencySetTrustworthy(tmp)
  ok(realShape.ok, `KNOWN-GOOD: nested join(dirname(fileURLToPath(import.meta.url)), …) is trusted${realShape.ok ? "" : ` — ${realShape.reasons[0]}`}`)
  rmSync(join(tmp, "eslint-rules", "real.mjs"))

  writeFileSync(join(tmp, "eslint-rules", "rogue.mjs"),
    'import { readFileSync } from "node:fs"\nconst x = readFileSync("/etc/other.json", "utf8")\n')
  const rogue = guard(tmp)
  ok(rogue.action === "untrusted" && !existsSync(cache),
    "a rule reading an unhashable path makes the set UNTRUSTED and drops the cache")
  ok(rogue.reasons.some((r) => r.includes("rogue.mjs")), "…and names the offending rule")

  rmSync(join(tmp, "eslint-rules", "rogue.mjs"))
  seedCache()
  ok(guard(tmp).action !== "untrusted", "removing the rogue rule restores trust")

  // A `..` escape is unhashable even when anchored — the root list only walks eslint-rules/.
  writeFileSync(join(tmp, "eslint-rules", "esc.mjs"),
    'import { readFileSync } from "node:fs"\nconst x = readFileSync(join(here, "../outside.json"))\n')
  ok(guard(tmp).action === "untrusted", "an anchored read that escapes the directory is UNTRUSTED")
  rmSync(join(tmp, "eslint-rules", "esc.mjs"))

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — invalidates on rule/baseline/config change, keeps otherwise")
  process.exit(failed ? 1 : 0)
}

const r = guard(process.cwd())
if (r.action === "untrusted") {
  // Exit non-zero so scripts/lint.mjs falls back to an uncached run. Not a hard failure: the
  // correct response to "the cache may be unsound" is to do MORE work, not to block the commit.
  console.log("[eslint-cache] dependency set NOT trustworthy — linting uncached:")
  for (const reason of r.reasons) console.log(`  ${reason}`)
  process.exit(2)
}
if (r.action !== "kept") console.log(`[eslint-cache] ${r.action} — ${r.files} dependency files hashed`)
