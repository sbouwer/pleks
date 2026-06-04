// scripts/check-supabase-columns.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Column-validator audit — Part 2 of ADDENDUM_SCHEMA_SELECT_GUARD.
//
// Validates every `.from("t").select("…")` in the codebase against the committed
// schema-columns.json manifest, FAILING the build on a column that doesn't exist on
// that table/view. Catches the phantom-column class (the 2026-06-04 org-branding drift
// selected brand_logo_url / address_line1 / city on `organisations` — none exist) BEFORE
// commit, where Part 1 only made the runtime failure loud.
//
// SAFETY: warn-don't-fail on anything it can't statically resolve — dynamic selects
// (variables / template literals with substitutions), `*`, aggregates, and embeds whose
// relation isn't in the manifest. It only FAILS on a confidently-wrong (table, column).
//
// Parser handles: plain lists, column aliases (alias:real_col → validate real_col), casts
// (col::type), JSON paths (col->>'k'), nested embeds (units(...)), and FK-aliased/hinted
// embeds (tenant:tenants!tenant_id(...)) — recursing into each.
//
// USAGE:  node scripts/check-supabase-columns.mjs        # exits 1 on any phantom column
//         Regenerate the manifest with gen-schema-columns.mjs after a schema change.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

// ── Pure parser/validator (exported for the fixture test) ──────────────────────

/** Split a select string by top-level commas (respecting embed parentheses). */
export function splitTopLevel(s) {
  const out = []
  let depth = 0
  let cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && depth === 0) { out.push(cur); cur = "" }
    else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Resolve the embed target table from an embed head, e.g.
 *   "units" -> "units", "tenant:tenants" -> "tenants",
 *   "tenant:tenants!tenant_id" -> "tenants", "...address" -> "address". */
function embedTable(head) {
  let rel = head.includes(":") ? head.slice(head.indexOf(":") + 1) : head
  rel = rel.split("!")[0]            // drop FK hint
  rel = rel.replace(/^\.\.\./, "")   // drop spread prefix
  return rel.trim()
}

/** Reduce a column token to its bare column name, or null if it isn't a plain column
 *  we can validate (aggregate, computed, etc. → skip, never fail). */
function bareColumn(tok) {
  if (!tok || tok === "*" || tok.startsWith("...")) return null
  if (tok === "count") return null
  let col = tok.includes(":") ? tok.slice(tok.indexOf(":") + 1) : tok // strip alias
  col = col.split("::")[0]   // strip cast
  col = col.split("->")[0]   // strip json path
  col = col.replace(/['"`]/g, "").trim()
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) return null // not a plain identifier → skip
  return col
}

/**
 * Validate a select string against the manifest, recursing into embeds.
 * @returns {{violations: {table:string,col:string}[], unknownTables: Set<string>}}
 */
export function validateSelectText(table, selectText, manifest, acc = { violations: [], unknownTables: new Set() }) {
  const cols = manifest[table]
  for (const tok of splitTopLevel(selectText)) {
    const parenIdx = tok.indexOf("(")
    if (parenIdx !== -1) {
      const head = tok.slice(0, parenIdx).trim()
      if (head.includes(".")) continue // aggregate like amount.sum() — skip
      const inner = tok.slice(parenIdx + 1, tok.lastIndexOf(")"))
      const rel = embedTable(head)
      if (manifest[rel]) validateSelectText(rel, inner, manifest, acc)
      else acc.unknownTables.add(rel)
      continue
    }
    const col = bareColumn(tok)
    if (!col) continue
    if (!cols) { acc.unknownTables.add(table); continue }
    if (!cols.includes(col)) acc.violations.push({ table, col })
  }
  return acc
}

// ── Scanner (runs only when invoked directly) ──────────────────────────────────

async function main() {
  const { Project, SyntaxKind, Node } = await import("ts-morph")
  const manifest = JSON.parse(readFileSync(resolve(__dirname, "schema-columns.json"), "utf8"))

  const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/]
  const project = new Project({ tsConfigFilePath: resolve(ROOT, "tsconfig.json"), skipAddingFilesFromTsConfig: false })

  const failures = []   // { file, line, table, col }
  const dynamic = []    // { file, line, table }
  const unknownTables = new Set()

  /** Walk a `.select(...)` call's object chain to the nearest `.from("literal")` table. */
  function fromTable(selectCall) {
    let node = selectCall.getExpression() // MemberExpression `.select`
    while (node) {
      if (Node.isPropertyAccessExpression(node)) {
        node = node.getExpression()
      } else if (Node.isCallExpression(node)) {
        const callee = node.getExpression()
        if (Node.isPropertyAccessExpression(callee) && callee.getName() === "from") {
          const arg = node.getArguments()[0]
          if (arg && Node.isStringLiteral(arg)) return arg.getLiteralText()
          return null // dynamic .from(var) — can't attribute
        }
        node = node.getExpression()
      } else {
        return null
      }
    }
    return null
  }

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath()
    if (EXCLUDE.some((re) => re.test(filePath))) continue
    const rel = relative(ROOT, filePath)

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression()
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "select") continue

      const table = fromTable(call)
      if (!table) continue                 // not a `.from("literal").select(...)` we can attribute
      if (!manifest[table]) { unknownTables.add(table); continue } // non-public/unknown → warn only

      const arg = call.getArguments()[0]
      if (!arg) continue                    // .select() — all columns, fine
      const line = call.getStartLineNumber()

      let text
      if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
        text = arg.getLiteralText()
      } else {
        dynamic.push({ file: rel, line, table })  // variable / template w/ substitution → warn
        continue
      }

      const acc = validateSelectText(table, text, manifest)
      for (const v of acc.violations) failures.push({ file: rel, line, table: v.table, col: v.col })
      for (const t of acc.unknownTables) unknownTables.add(t)
    }
  }

  // ── Baseline-aware reporting ──
  // Baseline key omits the line number so it survives code moves. Burn down the backlog by
  // fixing sites and re-running --update-baseline; the gate fails only on NEW violations.
  const BASELINE_PATH = resolve(__dirname, "schema-columns.baseline.json")
  const keyOf = (f) => `${f.file.replace(/\\/g, "/")}::${f.table}::${f.col}`

  if (process.argv.includes("--update-baseline")) {
    const counts = {}
    for (const f of failures) counts[keyOf(f)] = (counts[keyOf(f)] ?? 0) + 1
    const sorted = {}
    for (const k of Object.keys(counts).sort()) sorted[k] = counts[k]
    writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n")
    console.log(`\n✓ baseline updated — ${failures.length} known phantom column(s) across ${Object.keys(sorted).length} site(s)`)
    console.log(`  Tracked debt: the gate now fails only on NEW violations beyond this set.`)
    return
  }

  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {}
  const remaining = { ...baseline }
  const novel = []
  for (const f of failures) {
    const k = keyOf(f)
    if ((remaining[k] ?? 0) > 0) remaining[k]--
    else novel.push(f)
  }
  const baselined = failures.length - novel.length
  const stale = Object.values(remaining).reduce((s, n) => s + n, 0) // baselined entries no longer hit = burned down

  console.log("\n🔎  Supabase column validator")
  console.log("──────────────────────────────────────────────────")
  if (dynamic.length) console.log(`  ⚠ ${dynamic.length} dynamic select(s) not statically validated (variable/interpolated)`)
  if (unknownTables.size) console.log(`  ⚠ ${unknownTables.size} relation(s) not in the manifest (not validated): ${[...unknownTables].sort().join(", ")}`)
  if (baselined) console.log(`  • ${baselined} known phantom column(s) baselined as tracked debt`)
  if (stale) console.log(`  • ${stale} baselined entr(ies) no longer present — burned down; run --update-baseline to prune`)

  if (novel.length === 0) {
    console.log(`  ✓ no NEW phantom columns`)
    console.log("──────────────────────────────────────────────────")
    return
  }

  console.log(`\n  ✗ ${novel.length} NEW phantom column(s):`)
  for (const f of novel) {
    console.log(`     ${f.file}:${f.line} — .from("${f.table}").select(… "${f.col}" …) — column "${f.col}" does not exist on "${f.table}"`)
  }
  console.log("──────────────────────────────────────────────────")
  console.log("  Fix the column name, or regenerate the manifest if the schema changed (node scripts/gen-schema-columns.mjs).")
  console.log("  If genuinely intentional, accept it into the baseline: node scripts/check-supabase-columns.mjs --update-baseline")
  process.exit(1)
}

// Run the scan only when invoked directly (not when the test imports the pure functions).
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : ""
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
