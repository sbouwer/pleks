/**
 * scripts/check-file-headers.mjs — CI ratchet: no NEW FILL: header stubs may be committed
 *
 * CLAUDE.md mandates "never commit a FILL: stub", but nothing enforced it, so ~454 accumulated. This grandfathers
 * the existing ones in file-headers.baseline.json and fails the build on:
 *   (a) a FILL: stub NOT in the baseline — a new or edited file left unfilled, and
 *   (b) a baselined file that's since been filled or removed but is still listed — forcing the baseline to shrink
 *       (debt can only go down, never sideways).
 * Burn down via the "touch a file → fill its header" rule, then `node scripts/check-file-headers.mjs --update-baseline`.
 *
 * Usage:
 *   node scripts/check-file-headers.mjs                    # CI check (exit 1 on drift) — runs in `npm run check`
 *   node scripts/check-file-headers.mjs --update-baseline  # rewrite the baseline to the current stub set
 *
 * File discovery mirrors scripts/inject-file-headers.mjs (the stub injector) so the two stay in lockstep.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, extname } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "").replace(/^\/([A-Za-z]:)/, "$1")
const BASELINE_PATH = join(ROOT, "scripts", "file-headers.baseline.json")
const UPDATE = process.argv.includes("--update-baseline")

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".claude", "dist", "out", ".turbo",
  "public", "coverage", "storybook-static", "scripts",
])
const SKIP_FILES = new Set([
  "next.config.ts", "next.config.js", "next-env.d.ts",
  "postcss.config.mjs", "tailwind.config.ts",
  "jest.config.ts", "vitest.config.ts",
  "docker-compose.yml", "docker-compose.yaml",
])
const EXTS = new Set([".ts", ".tsx", ".yml", ".yaml"])

const stubs = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (SKIP_FILES.has(name)) continue
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs)
      continue
    }
    if (!EXTS.has(extname(abs))) continue
    if (readFileSync(abs, "utf8").includes("FILL:")) {
      stubs.push(relative(ROOT, abs).replaceAll("\\", "/"))
    }
  }
}
walk(ROOT)
stubs.sort()

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(stubs, null, 2) + "\n", "utf8")
  console.log(`Baseline updated: ${stubs.length} file(s) with FILL: stubs grandfathered.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : []
const baselineSet = new Set(baseline)
const currentSet = new Set(stubs)

const added = stubs.filter((f) => !baselineSet.has(f))   // new/edited file left unfilled
const fixed = baseline.filter((f) => !currentSet.has(f)) // baselined file filled or removed → shrink the baseline

let failed = false
if (added.length) {
  failed = true
  console.error(`\n✗ ${added.length} file(s) committed with an unfilled FILL: header — fill it before committing (CLAUDE.md FILE HEADERS):`)
  for (const f of added) console.error(`    ${f}`)
}
if (fixed.length) {
  failed = true
  console.error(`\n✗ ${fixed.length} baselined file(s) no longer carry a FILL: stub — the ratchet only shrinks. Re-record it:`)
  console.error(`    node scripts/check-file-headers.mjs --update-baseline`)
  for (const f of fixed) console.error(`    (filled/removed) ${f}`)
}

if (failed) process.exit(1)
console.log(`✓ file headers: no new FILL: stubs (${baseline.length} grandfathered, burning down)`)
