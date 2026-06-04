// scripts/codemod-supabase-error.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-off codemod: make swallowed Supabase errors LOUD, safely.
//
// Companion to the `pleks/require-supabase-error-check` ESLint rule. That rule
// flags `const { data } = await <supabaseChain>` that omits `error` (so a 42703 /
// RLS failure / timeout returns { data: null, error } and the downstream `?? []`
// silently hides it). This codemod fixes the SAFE majority automatically.
//
// SAFETY BOUNDARY — surface the error, NEVER guess the recovery:
//   const { data: rows } = await supabase.from("leases").select(...)
//     →
//   const { data: rows, error: rowsError } = await supabase.from("leases").select(...)
//   logQueryError("fetchLeases leases", rowsError)
//
// It binds `error` (uniquely named) and LOGS it via the shared helper. It does NOT add
// `return []` / `throw` / `redirect` — those differ per call site (list vs single vs
// action vs component); guessing them would inject wrong control flow into hundreds of
// files. Control flow + return value are untouched: the existing `?? []` still runs
// exactly as before; the only runtime change is a logged error when a query fails.
// Behaviour-preserving, cannot break a call site. "Is `?? []` even the right recovery
// here?" stays a manual ratchet — but every failure is now visible instead of silent.
//
// WHY logQueryError() NOT inline `if (error) console.error(...)`:
//   An inline `if` adds a branch; applied to query-heavy functions it tips them over
//   sonarjs/cognitive-complexity (eslint threshold 25) and breaks `npm run check`. A
//   single function call adds no branch. (Learned fixing the top-20 by hand — several
//   functions had to be refactored to exactly such a helper.) See lib/supabase/logQueryError.ts.
//
// WHY UNIQUE error names (rowsError, not error):
//   A function commonly has several queries. A fixed `error` name collides, so a
//   collision-skip strategy fixes only the first per run (the rest need re-runs or manual
//   work). Per-site unique names fix the whole function in ONE pass.
//
// CHAIN DETECTION matches the ESLint rule exactly (presence of `.from(`/`.rpc(` in the
//   awaited chain) — NOT a terminal check — so the codemod covers 100% of what the rule
//   baselines, including storage `.from(bucket).createSignedUrl()/.download()` which also
//   return { data, error }.
//
// SKIP-AND-REPORT (never touched; listed in the report for manual handling):
//   • chain ends in `.throwOnError()`         → already throws on error
//   • destructure already binds `error`       → already handled (idempotent re-runs)
//   • not the canonical `const { data… } = await <chain>` shape
//   • the statement isn't in a block we can safely insert after
//   • the awaited expression isn't clearly a Supabase query (no `.from(`/`.rpc(`)
//
// USAGE:
//   npm i -D ts-morph                                   # required (AST codemod)
//   node scripts/codemod-supabase-error.mjs             # DRY RUN — reports only, writes nothing
//   node scripts/codemod-supabase-error.mjs --write     # apply edits + write report
//   node scripts/codemod-supabase-error.mjs --write --report out.json
//
// After --write: review the diff, run `npm run check`, then regenerate the ESLint
// suppressions baseline (`npx eslint . --suppress-rule pleks/require-supabase-error-check`)
// — it should shrink by the transformed count.
// ─────────────────────────────────────────────────────────────────────────────

import { Project, SyntaxKind, Node } from "ts-morph"
import { writeFileSync, readFileSync } from "node:fs"
import { basename, relative } from "node:path"

const WRITE = process.argv.includes("--write")
const reportFlagIdx = process.argv.indexOf("--report")
const REPORT_PATH = reportFlagIdx !== -1 ? process.argv[reportFlagIdx + 1] : "scripts/codemod-supabase-error.report.json"

const ROOT = process.cwd()

// ── Shared helper (lib/supabase/logQueryError.ts) — a CALL, not an inline `if`, so it
//    adds zero cognitive-complexity. It no-ops when error is null. ──────────────────
const HELPER_NAME = "logQueryError"
const HELPER_MODULE = "@/lib/supabase/logQueryError"
const helperCall = (label, errName) => `${HELPER_NAME}(${JSON.stringify(label)}, ${errName})`

// Don't touch these areas.
const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/]

const project = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: false })

const transformed = [] // { file, line, errName, label }
const skipped = []     // { file, line, reason }
const fillHeaderFiles = new Set() // touched files that still carry a FILL: header

/**
 * Does the awaited expression contain a Supabase entrypoint (`.from(`/`.rpc(`)?
 * Matches the ESLint rule (entrypoint presence, not a terminal) so storage
 * `.from(bucket).createSignedUrl()` etc. are covered too.
 */
function isSupabaseChain(expr) {
  const calls = [...expr.getDescendantsOfKind(SyntaxKind.CallExpression)]
  if (Node.isCallExpression(expr)) calls.push(expr)
  for (const call of calls) {
    const callee = call.getExpression()
    if (!Node.isPropertyAccessExpression(callee)) continue
    const name = callee.getName()
    if (name === "from" || name === "rpc") return true
  }
  return false
}

/** Property names bound by an object-binding-pattern (by PROPERTY name, not alias). */
function boundPropertyNames(pattern) {
  const names = new Set()
  for (const el of pattern.getElements()) {
    const prop = el.getPropertyNameNode()
    names.add(prop ? prop.getText().replace(/['"`]/g, "") : el.getNameNode().getText())
  }
  return names
}

/** Local name the `data` property is bound to (its alias, or "data"). */
function dataLocalName(pattern) {
  for (const el of pattern.getElements()) {
    const prop = el.getPropertyNameNode()
    const propName = prop ? prop.getText().replace(/['"`]/g, "") : el.getNameNode().getText()
    if (propName === "data") {
      // Strip nested-pattern / default noise, keep a leading identifier if present.
      const m = el.getNameNode().getText().match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/)
      return m ? m[0] : "data"
    }
  }
  return "data"
}

/** Enclosing function (or the source file) for scope-uniqueness checks + labels. */
function enclosingScope(decl) {
  const fn = decl.getFirstAncestor(
    (a) =>
      Node.isFunctionDeclaration(a) ||
      Node.isArrowFunction(a) ||
      Node.isFunctionExpression(a) ||
      Node.isMethodDeclaration(a),
  )
  return { fn, scope: fn ?? decl.getSourceFile() }
}

/** A unique, readable error binding name for this site (e.g. rowsError, rowsError2). */
function uniqueErrorName(decl, pattern) {
  const local = dataLocalName(pattern)
  const base = `${local && local !== "data" ? local : "query"}Error`
  const { scope } = enclosingScope(decl)
  const taken = new Set(scope.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText()))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}

/** Short context label for the log, e.g. "fetchLeases leases" or "syncJob rpc:do_thing". */
function buildLabel(decl, awaitedText) {
  const { fn } = enclosingScope(decl)
  let fnName = fn && typeof fn.getName === "function" ? fn.getName() : undefined
  if (!fnName && fn && Node.isArrowFunction(fn)) {
    fnName = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName()
  }
  const base = fnName || basename(decl.getSourceFile().getFilePath()).replace(/\.[tj]sx?$/, "")
  const tableMatch = awaitedText.match(/\.from\(\s*["'`]([^"'`]+)["'`]/)
  const rpcMatch = awaitedText.match(/\.rpc\(\s*["'`]([^"'`]+)["'`]/)
  const rpcLabel = rpcMatch ? `rpc:${rpcMatch[1]}` : ""
  const target = tableMatch?.[1] ?? rpcLabel
  // Bare context — logQueryError() adds the "[…] supabase query failed:" framing (format once).
  return `${base}${target ? ` ${target}` : ""}`
}

/** Ensure `import { logQueryError } from "@/lib/supabase/logQueryError"` exists in the file. */
function ensureHelperImport(sf) {
  const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === HELPER_MODULE)
  if (existing) {
    if (!existing.getNamedImports().some((n) => n.getName() === HELPER_NAME)) existing.addNamedImport(HELPER_NAME)
  } else {
    sf.addImportDeclaration({ moduleSpecifier: HELPER_MODULE, namedImports: [HELPER_NAME] })
  }
}

for (const sf of project.getSourceFiles()) {
  const filePath = sf.getFilePath()
  if (EXCLUDE.some((re) => re.test(filePath))) continue
  const rel = relative(ROOT, filePath)
  let touchedThisFile = false

  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer()
    if (!init || !Node.isAwaitExpression(init)) continue
    const nameNode = decl.getNameNode()
    if (!Node.isObjectBindingPattern(nameNode)) continue

    const awaited = init.getExpression()
    if (!isSupabaseChain(awaited)) continue

    const props = boundPropertyNames(nameNode)
    if (!props.has("data")) continue   // not a data-bearing destructure
    if (props.has("error")) continue   // already handled — idempotent

    const line = decl.getStartLineNumber()
    const awaitedText = awaited.getText()

    // ── skip conditions ──
    if (/\.throwOnError\s*\(/.test(awaitedText)) {
      skipped.push({ file: rel, line, reason: "chain uses .throwOnError() (already throws)" })
      continue
    }
    const stmt = decl.getVariableStatement()
    const parent = stmt?.getParent()
    const canInsert = parent && typeof parent.insertStatements === "function" && typeof parent.getStatements === "function"
    if (!stmt || !canInsert) {
      skipped.push({ file: rel, line, reason: "statement not in an insertable block" })
      continue
    }

    // ── SAFE TRANSFORM ──
    const errName = uniqueErrorName(decl, nameNode)
    const label = buildLabel(decl, awaitedText)
    if (WRITE) {
      // 1) bind `error` (uniquely named) alongside the existing elements
      const inner = nameNode.getElements().map((e) => e.getText()).join(", ")
      nameNode.replaceWithText(`{ ${inner}, error: ${errName} }`)
      // 2) insert the loud-but-harmless log right after (a CALL, not a branch)
      const statements = parent.getStatements()
      const idx = statements.findIndex((s) => s.getStart() === stmt.getStart())
      parent.insertStatements(idx + 1, helperCall(label, errName))
      touchedThisFile = true
    }
    transformed.push({ file: rel, line, errName, label })
  }

  if (touchedThisFile) {
    ensureHelperImport(sf)
    // Flag a remaining FILL: stub header so it gets a real one before commit (CLAUDE.md).
    if (/\bFILL:/.test(readFileSync(filePath, "utf8"))) fillHeaderFiles.add(rel)
  }
}

if (WRITE) {
  await project.save()
}

const report = {
  mode: WRITE ? "write" : "dry-run",
  transformedCount: transformed.length,
  skippedCount: skipped.length,
  filesTouched: [...new Set(transformed.map((t) => t.file))].length,
  fillHeaderFilesToFix: [...fillHeaderFiles],
  transformed,
  skipped,
}
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

// ── console summary ──
console.log(`\nSupabase error-check codemod — ${WRITE ? "WRITE" : "DRY RUN"}`)
console.log(`  would transform: ${transformed.length}  (across ${report.filesTouched} files)`)
console.log(`  skipped (manual): ${skipped.length}`)
const bySkip = {}
for (const s of skipped) bySkip[s.reason] = (bySkip[s.reason] ?? 0) + 1
for (const [reason, n] of Object.entries(bySkip).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(n).padStart(4)}  ${reason}`)
}
if (WRITE && fillHeaderFiles.size) {
  console.log(`\n  ⚠ ${fillHeaderFiles.size} touched file(s) still have a FILL: header — fill before commit.`)
}
console.log(`\n  report → ${REPORT_PATH}`)
if (!WRITE) console.log(`  (dry run — re-run with --write to apply)\n`)
