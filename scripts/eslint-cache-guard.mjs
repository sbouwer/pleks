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
 * Probe-first, both directions: `--selftest`.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const CACHE = ".eslintcache"
const KEY = ".eslintcache.key"

/** Every file whose content can change a lint RESULT without changing the linted file. */
export function dependencyFiles(root) {
  const out = []
  const cfg = join(root, "eslint.config.mjs")
  if (existsSync(cfg)) out.push(cfg)
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
  return out.sort()
}

/** Content hash over those files. Names included, so a rename alone invalidates. */
export function computeKey(files) {
  const h = createHash("sha256")
  for (const f of files) {
    h.update(f.replace(/\\/g, "/").split("/").slice(-2).join("/"))
    h.update(readFileSync(f))
  }
  return h.digest("hex")
}

/** Drop the cache iff the dependency hash moved. Returns what it did, for the probe. */
export function guard(root) {
  const files = dependencyFiles(root)
  const key = computeKey(files)
  const keyPath = join(root, KEY)
  const cachePath = join(root, CACHE)
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

  ok(dependencyFiles(tmp).length === 4, `enumerates every dependency file (got ${dependencyFiles(tmp).length}, want 4)`)

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — invalidates on rule/baseline/config change, keeps otherwise")
  process.exit(failed ? 1 : 0)
}

const r = guard(process.cwd())
if (r.action !== "kept") console.log(`[eslint-cache] ${r.action} — ${r.files} rule/baseline files hashed`)
