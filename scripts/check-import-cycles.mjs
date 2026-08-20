#!/usr/bin/env node
/**
 * scripts/check-import-cycles.mjs — tier 0 of standards/CODEBASE-CRAWLERS: circular imports.
 *
 * PORTED FROM life-therapy (`scripts/check-import-cycles.mjs`), not reinvented. Their reasoning
 * transfers whole: the spec names `madge`, madge peer-depends on an older TypeScript than these
 * repos run, and a rejected tool is not a closed requirement — the spec explicitly sanctions owning
 * sixty lines instead. Owned code has no peer dependency to fight, matches the house style, and can
 * be probed in both directions, which madge could not be.
 *
 * WHAT LT'S RUN FOUND, and why it is worth having here: two cycles, both the same shape — a widget
 * declared a shared interface and the step components it renders imported that type back from their
 * own parent. The imports were TYPE-ONLY, so TypeScript erased them and nothing ever failed. That is
 * exactly why it survived. A cycle that costs nothing today still constrains every later change: the
 * first time a child needs a VALUE from the parent, the loop becomes real and the symptom is a
 * module-initialisation error nowhere near the cause.
 *
 * WHAT THIS ADDS TO THE PORT: a `--selftest`. LT's header says the control "can be probed in both
 * directions" and none is wired, which in this repo is the difference between a control and a claim
 * — a cycle detector that reports zero is indistinguishable from a clean tree, and this session has
 * now found six controls that were green because they were blind.
 *
 * SCOPE, stated because an unstated limit gets trusted past. Static `import … from "…"` only,
 * resolving `@/` (repo root, per tsconfig paths) and relative specifiers. `require()`, dynamic
 * `import()` and re-export-only cycles are NOT followed. Tests are excluded: a test importing its
 * subject is not a cycle anyone needs told about.
 */
import { readdirSync, readFileSync, existsSync, statSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
const SCANNED = ["app", "lib", "components"]
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "generated"])
const TEST_FILE = /\.(test|dbtest|spec)\.tsx?$/

export function sourceFiles(root = ROOT, scanned = SCANNED) {
  const out = []
  for (const d of scanned) {
    ;(function walk(dir) {
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) continue
        const p = join(dir, e.name).replace(/\\/g, "/")
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !TEST_FILE.test(e.name)) out.push(p)
      }
    })(join(root, d).replace(/\\/g, "/"))
  }
  return out
}

/** Resolve an import specifier to a file on disk, or null for a package import. */
export function resolveSpec(fromFile, spec, root = ROOT) {
  let base
  if (spec.startsWith("@/")) base = `${root}/${spec.slice(2)}`
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec).replace(/\\/g, "/")
  else return null
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand.replace(/\\/g, "/")
  }
  return null
}

export function buildGraph(files, root = ROOT) {
  const graph = new Map()
  for (const f of files) {
    const src = readFileSync(f, "utf8")
    const deps = new Set()
    for (const m of src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*["']([^"']+)["']/g)) {
      const r = resolveSpec(f, m[1], root)
      if (r && r !== f) deps.add(r)
    }
    graph.set(f, [...deps])
  }
  return graph
}

const BASELINE_PATH = `${ROOT}/scripts/import-cycles.baseline.json`

/**
 * A cycle's identity, independent of where the DFS happened to enter it.
 *
 * The same loop is discoverable from any of its members, and which one the walk reaches first
 * depends on directory order — so a raw path list would change identity when a file is renamed
 * elsewhere in the tree, and a baseline keyed on it would silently stop matching. Rotated to its
 * lexicographically smallest member, which is stable.
 */
export function cycleKey(cycle) {
  const nodes = cycle.slice(0, -1).map((p) => p.replace(/^.*?\/(app|lib|components)\//, "$1/"))
  let best = 0
  for (let i = 1; i < nodes.length; i++) if (nodes[i] < nodes[best]) best = i
  const rotated = [...nodes.slice(best), ...nodes.slice(0, best)]
  return rotated.join(" → ")
}

/**
 * The baseline's two directions, pure so both can be probed.
 *
 * `fresh` is a cycle the baseline does not list — a regression, and the point of the check.
 * `fixed` is a baselined cycle no longer in the tree — the baseline must SHRINK with the fix, and
 * leaving that to goodwill is how a baseline becomes a permanent exemption list.
 */
export function reconcile(cycles, baselined) {
  const present = new Set(cycles.map(cycleKey))
  return {
    fresh: cycles.filter((c) => !baselined.has(cycleKey(c))),
    fixed: [...baselined].filter((k) => !present.has(k)),
  }
}

export function findCycles(files, graph) {
  const cycles = []
  const state = new Map()
  const stack = []
  function visit(node) {
    state.set(node, "open")
    stack.push(node)
    for (const dep of graph.get(node) ?? []) {
      if (state.get(dep) === "open") cycles.push([...stack.slice(stack.indexOf(dep)), dep])
      else if (!state.has(dep)) visit(dep)
    }
    stack.pop()
    state.set(node, "done")
  }
  for (const f of files) if (!state.has(f)) visit(f)
  return cycles
}

// Only when RUN. This module exports its walker and detector so other probes can drive them, and
// an unguarded top-level audit means importing it audits the repo and can process.exit the importer
// — the defect check-hook-registration shipped with earlier this session.
const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  // Fixtures on disk, walked by the real `sourceFiles` — a fixture handed straight to `findCycles`
  // would prove the DFS and nothing about discovery, which is the half that decays.
  const tmp = mkdtempSync(join(tmpdir(), "cycles-")).replace(/\\/g, "/")
  mkdirSync(join(tmp, "lib", "nested"), { recursive: true })
  const w = (p, s) => writeFileSync(join(tmp, p), s)

  w("lib/a.ts", 'import { b } from "./b"\nexport const a = b\n')
  w("lib/b.ts", 'export const b = 1\n')
  ok(findCycles(sourceFiles(tmp, ["lib"]), buildGraph(sourceFiles(tmp, ["lib"]), tmp)).length === 0,
    "KNOWN-GOOD: a one-way import is not a cycle")

  w("lib/b.ts", 'import { a } from "./a"\nexport const b = a\n')
  ok(findCycles(sourceFiles(tmp, ["lib"]), buildGraph(sourceFiles(tmp, ["lib"]), tmp)).length > 0,
    "a two-file cycle fires")

  // The shape LT actually found: TYPE-ONLY, so TypeScript erases it and nothing else notices.
  w("lib/a.ts", 'import type { B } from "./b"\nexport type A = B\n')
  w("lib/b.ts", 'import type { A } from "./a"\nexport type B = A\n')
  ok(findCycles(sourceFiles(tmp, ["lib"]), buildGraph(sourceFiles(tmp, ["lib"]), tmp)).length > 0,
    "a TYPE-ONLY cycle fires — the shape that survives because nothing breaks")

  // Longer than two hops, and through the `@/` alias rather than a relative path.
  w("lib/a.ts", 'import { b } from "@/lib/nested/b"\nexport const a = b\n')
  w("lib/nested/b.ts", 'import { c } from "@/lib/c"\nexport const b = c\n')
  w("lib/c.ts", 'import { a } from "@/lib/a"\nexport const c = a\n')
  ok(findCycles(sourceFiles(tmp, ["lib"]), buildGraph(sourceFiles(tmp, ["lib"]), tmp)).length > 0,
    "a three-hop cycle through the @/ alias fires")

  // A test file importing its subject is not a cycle anyone needs told about.
  rmSync(join(tmp, "lib", "nested"), { recursive: true, force: true })
  w("lib/a.ts", 'export const a = 1\n')
  w("lib/c.ts", 'export const c = 1\n')
  w("lib/b.ts", 'export const b = 1\n')
  w("lib/a.test.ts", 'import { a } from "./a"\nexport const t = a\n')
  ok(sourceFiles(tmp, ["lib"]).every((f) => !f.endsWith(".test.ts")),
    "KNOWN-GOOD: test files are excluded from the walk")

  ok(sourceFiles(tmp, ["does-not-exist"]).length === 0,
    "a missing directory yields nothing rather than throwing — the floor below is what catches it")

  // ── The baseline, both directions ────────────────────────────────────────────────────────────
  // A baseline that only ever suppresses is an exemption list. Both halves are what make it a
  // ratchet, and both are cheap to get wrong silently.
  const cyc = (...n) => [...n, n[0]].map((x) => `${ROOT}/lib/${x}.ts`)
  const KEY = cycleKey(cyc("a", "b"))

  ok(reconcile([cyc("a", "b")], new Set([KEY])).fresh.length === 0,
    "KNOWN-GOOD: a baselined cycle is quiet")
  ok(reconcile([cyc("a", "b")], new Set()).fresh.length === 1,
    "a cycle NOT in the baseline fires — the regression case")
  ok(reconcile([], new Set([KEY])).fixed.length === 1,
    "a baselined cycle that is FIXED fires until it leaves the baseline — it only shrinks")
  ok(reconcile([cyc("a", "b")], new Set([KEY])).fixed.length === 0,
    "KNOWN-GOOD: a baselined cycle still present is not reported as fixed")
  // Entry-point independence: the same loop found from a different member is the same key, or a
  // rename elsewhere in the tree would silently un-baseline it.
  ok(cycleKey(cyc("b", "a")) === cycleKey(cyc("a", "b")),
    "the same loop keys identically whichever member the walk entered from")

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on real cycles, quiet on one-way imports")
  process.exit(failed ? 1 : 0)
}

if (isEntry) {
const files = sourceFiles()

// L-10: assert the ENUMERATION before asserting anything about its members. A walk that finds
// nothing reports zero cycles, which is indistinguishable from a clean tree. The floor is a real
// figure well under the current count, not `> 0` — a glob decaying from 800 files to 1 still passes
// `> 0`.
const FLOOR = 400
if (files.length < FLOOR) {
  console.error(
    `\n❌ import-cycles: only ${files.length} files discovered (floor ${FLOOR}).\n` +
      `   The walk is broken or the tree moved — a scan of nothing reports a clean tree.\n`,
  )
  process.exit(1)
}

const cycles = findCycles(files, buildGraph(files))
const short = (p) => p.replace(ROOT + "/", "")

// An OBJECT, not the flat array the other baselines use, because these entries need grouping:
// four families cover seventeen cycles, and a reason per family beside its entries is more honest
// than seventeen copies of the same sentence or a pointer to prose somewhere else.
const baselined = existsSync(BASELINE_PATH) ? new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")).cycles) : new Set()
const { fresh, fixed } = reconcile(cycles, baselined)

if (fresh.length) {
  console.error(`\n❌ import-cycles: ${fresh.length} NEW circular import(s)\n`)
  for (const c of fresh) console.error(`   ${c.map(short).join("\n     → ")}\n`)
  console.error(
    `   Break the loop by moving what both sides share into its own module — a type declared on a\n` +
      `   parent and imported back by its children is the usual shape, and the fix is a new file\n` +
      `   holding the shared type.\n`,
  )
  process.exit(1)
}

// The baseline only shrinks, and it says so out loud rather than leaving the shrink to goodwill —
// exactly how check-file-headers and check-pii-classification treat theirs.
if (fixed.length) {
  console.error(`\n❌ import-cycles: ${fixed.length} baselined cycle(s) are FIXED — remove them from`)
  console.error(`   ${BASELINE_PATH.replace(ROOT + "/", "")}. Tightening the baseline is part of the fix's acceptance.\n`)
  for (const k of fixed) console.error(`   ${k}`)
  process.exit(1)
}

console.log(`🔄 import cycles: no new cycles across ${files.length} files (${baselined.size} baselined, burning down)`)
}
