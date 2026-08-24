/**
 * scripts/check-server-action-exports.mjs — every export from a "use server" module must be async
 *
 * Next.js requires it: a `"use server"` file's exports become RPC endpoints, so each one must be an async
 * function. A synchronous export fails `next build` with "Server Actions must be async functions".
 *
 * The problem is WHERE it fails. `tsc --noEmit` compiles it happily, ESLint says nothing, and every test
 * passes — so `npm run check` goes green and the break surfaces at DEPLOY. That is exactly what happened:
 * `parseLeaseFormData` was exported from `lib/actions/leases.ts` so the field-ablation harness could drive it,
 * every local gate went green, and Vercel failed the build.
 *
 * The fix for the code was to move the pure function OUT of the "use server" module (it never belonged there).
 * The fix for the CLASS is this check — the local gate must be able to fail for the same reason the deploy does,
 * otherwise "green locally" is a claim about the gate rather than about the code.
 *
 * Run: node scripts/check-server-action-exports.mjs   (wired into `npm run check`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SKIP = new Set(["node_modules", ".next", ".git", "test", "dist", "coverage"])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec|dbtest)\./.test(name)) yield full
  }
}

/**
 * Is this module a server-action module?
 *
 * The directive must be the FIRST statement — that is what makes the module one, per Next.js, and it
 * is also what keeps this mention-safe: prose, a comment, or a nested function's own directive is
 * not a module directive. Anchored and quote-bearing since it was written; the fixture below records
 * that property rather than establishing it, which is the honest reason this one needed no fix.
 */
export function isServerActionModule(src) {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(src)
}

function selftest() {
  const cases = [
    ["KNOWN-GOOD: the directive as the first statement is a server-action module", '"use server"\nexport async function f() {}', true],
    ["…and after a leading block comment, which is where this repo's headers live", '/**\n * a header\n */\n"use server"\nexport async function f() {}', true],
    ["single quotes count too", "'use server'\nexport async function f() {}", true],
    // R6 mention-fixture — see scripts/check-mention-fixtures.mjs.
    ["mention-fixture: prose naming the directive does not make a module one",
      '/**\n * Moved the pure function OUT of the "use server" module.\n */\nexport function helper() {}', false],
    ["mention-fixture: a nested directive is not a module directive",
      'export function f() {\n  "use server"\n  return 1\n}', false],
    ["mention-fixture: the phrase unquoted in a comment is not a directive",
      "// every use server file's exports become RPC endpoints\nexport function g() {}", false],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const got = isServerActionModule(src)
    if (got !== want) { bad++; console.log(`  ✗ ${label} — expected ${want}, got ${got}`) }
    else console.log(`  ✓ ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-server-action-exports selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const offenders = []

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8")
  if (!isServerActionModule(src)) continue

  for (const m of src.matchAll(/^export\s+(?!type\b|interface\b|default\s+async\b)(\w+)\s+(\w+)/gm)) {
    const [, keyword, name] = m
    if (keyword === "async") continue                     // export async function …
    if (keyword === "const" || keyword === "let" || keyword === "var") {
      // `export const foo = async (…) => …` is fine; a non-async const export is not.
      const line = src.slice(m.index, src.indexOf("\n", m.index))
      if (/=\s*async\b/.test(line)) continue
    }
    const line = src.slice(0, m.index).split("\n").length
    offenders.push({ file: relative(ROOT, file).replaceAll("\\", "/"), line, name, keyword })
  }
}

const rule = "─".repeat(92)
console.log(`\n🔎  "use server" exports must be async`)
console.log(rule)

if (offenders.length) {
  console.error(`  ✗ ${offenders.length} non-async export(s) from a "use server" module.`)
  console.error(`    next build fails with "Server Actions must be async functions" — but tsc, eslint and the`)
  console.error(`    tests all pass, so this would otherwise only surface at DEPLOY.`)
  console.error(`    Fix: move the pure function into its own (non-"use server") module and import it.`)
  for (const o of offenders) console.error(`      • ${o.file}:${o.line} — export ${o.keyword} ${o.name}`)
  console.log(rule)
  process.exit(1)
}

console.log('  ✓ every export from a "use server" module is async')
console.log(rule)
