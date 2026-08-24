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

/**
 * Does this source carry an UNFILLED header stub?
 *
 * ⚠ THIS WAS `src.includes("FILL:")` UNTIL 2026-08-23 — the token anywhere in the file, in any
 * context. R6: that reads a MENTION as the thing. A `.ts` file whose comment says "never commit a
 * FILL: stub" — or any doc quoting CLAUDE.md's own rule — was indistinguishable from a real stub,
 * and the fix a reader reaches for is to mangle the sentence rather than the check.
 *
 * The two forms `inject-file-headers.mjs` actually emits are the discriminator, and there are only
 * two: the token opens a comment line (`* FILL: fill in relevant fields`), or it follows the header's
 * em-dash separator (`* path/to/file.ts — FILL: one-line purpose`). Prose naming the token mid-
 * sentence matches neither. Verified against the generator rather than inferred from a sample.
 *
 * Deliberately NOT narrowed further: this errs toward FIRING, because a missed stub ships an
 * unfilled header while a false positive costs one rejected commit and a visible message.
 */
export function hasStub(src) {
  // Line-scanned with one flat character class — see the same note in check-knip-floor's
  // countTagsInSource: `\s*(?:…)\s*` backtracks super-linearly and fails sonarjs.
  for (const line of src.split(/\r?\n/)) {
    if (/^[\t *#\/]*FILL:/.test(line)) return true
    if (/—[\t ]*FILL:/.test(line)) return true
  }
  return false
}

function selftest() {
  const cases = [
    ["a stub opening a comment line FIRES", " * FILL: fill in relevant fields and delete unused ones:", true],
    ["a stub after the header em-dash FIRES", " * app/x/page.tsx — FILL: one-line purpose", true],
    ["a YAML stub FIRES — the # form the generator emits", "# .github/workflows/ci.yml — FILL: one-line purpose", true],
    ["KNOWN-GOOD: a filled header passes", " * app/x/page.tsx — renders the applicant portal\n * Auth:   gateway()", false],
    // R6 mention-fixture — see scripts/check-mention-fixtures.mjs.
    ["mention-fixture: prose QUOTING the rule is not a stub", ' * CLAUDE.md mandates "never commit a FILL: stub", but nothing enforced it.', false],
    ["mention-fixture: the same in a line comment", "// A FILL: stub would fail this gate.", false],
    ["mention-fixture: the token inside a string literal is not a header", 'const msg = "replace the FILL: placeholder"', false],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const got = hasStub(src)
    if (got !== want) { bad++; console.log(`  ✗ ${label} — expected ${want}, got ${got}`) }
    else console.log(`  ✓ ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-file-headers selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

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
    if (hasStub(readFileSync(abs, "utf8"))) {
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
