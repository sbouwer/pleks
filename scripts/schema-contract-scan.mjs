/**
 * scripts/schema-contract-scan.mjs — one net for the whole schema-contract-violation class
 * (ADDENDUM_SCHEMA_CONTRACT_SCREEN). Consolidates the select/filter/write scanners into one
 * manifest-driven framework and adds the matchers + policy layers they lacked.
 *
 * Bug class: code asserts a DB shape the live schema doesn't have (M1 → 42703/42P01/cast error → a
 * dead read/write) OR a sensitive write fails and is swallowed (M2). Both silent. Worst on POPIA
 * registers / money / logs.
 *
 * Matchers (all off scripts/schema-manifest.json):
 *   select      .select("a, b:real, units(c), col::date")  — cols + aliases + nested embeds + casts
 *   filter      .eq/.is/.in/.order/.not/.gt/.lt/.like/.match/.filter("col", …) — col exists; `::` invalid in a filter
 *   write       .insert/.update/.upsert({k:…})            — every key is a real column
 *   rpc         .rpc("fn", {args})                        — fn exists + arg names match the signature
 *   cardinality .single() after .order()/.limit()         — WARN (the .single()-throws-on-0-rows class)
 *   failure     a write to a CRITICAL table that is best-effort (.then(…)/.catch(…)) — §5, hard fail
 *
 * Sensitivity (§4): findings are tagged CRITICAL (POPIA/logs/money) / HIGH / NORMAL. CRITICAL M1 +
 * any §5 swallow are NEVER baselineable → hard-fail day one. NORMAL/HIGH M1 ride the baseline ratchet.
 * Output is grouped by criticality (POPIA/money first). Run: node scripts/schema-contract-scan.mjs
 *   --update-baseline   re-baseline the NORMAL/HIGH backlog (CRITICAL + warns are never baselined)
 *
 * Catches M1 statically. Does NOT catch runtime-only M2 (RLS/constraint/transient) — that needs the
 * behavioural harness (Category 14) or a typed client. Unit tests cannot catch this class (mocked DB).
 * See ADDENDUM_SCHEMA_CONTRACT_SCREEN §1/§5. The pure parser below is unit-tested.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const MANIFEST_PATH = resolve(__dirname, "schema-manifest.json")
const BASELINE_PATH = resolve(__dirname, "schema-contract.baseline.json")

const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\./, /\.spec\./]
const FILTER_METHODS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "not", "order", "filter"])
const WRITE_METHODS = new Set(["insert", "update", "upsert"])

// ── Sensitivity registry (§4) ──────────────────────────────────────────────────
const CRITICAL = new Set([
  "consent_log", "audit_log", "deposit_transactions", "deposit_reconciliations", "deposit_charges",
  "deposit_deduction_items", "payments", "rent_invoices", "application_screening_payments",
  "contact_bank_accounts", "tenant_bank_accounts", "bank_accounts", "data_subject_requests", "popia_exports",
])
const CRITICAL_PREFIX = ["trust_", "screening_", "application_screening_"]
const HIGH = new Set(["user_orgs", "user_orgs_tenants", "invites", "contacts", "organisations", "applications"])
export function criticality(table) {
  if (CRITICAL.has(table) || CRITICAL_PREFIX.some((p) => table.startsWith(p))) return "CRITICAL"
  if (HIGH.has(table)) return "HIGH"
  return "NORMAL"
}

// ── Pure parser (unit-tested) ───────────────────────────────────────────────────

/** Split a PostgREST select string into top-level fields (respecting embed parens). */
export function splitTopLevel(text) {
  const out = []
  let depth = 0
  let cur = ""
  for (const ch of text) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = "" } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * Validate a select string against a flat {table:[cols]} manifest, recursing into embeds.
 * Returns { violations: [{table, col}], unknownTables: Set }. Skips *, aggregates, casts, json paths.
 */
export function validateSelectText(table, text, tbl, acc = { violations: [], unknownTables: new Set() }) {
  if (!tbl[table]) { acc.unknownTables.add(table); return acc }
  for (const raw of splitTopLevel(text)) {
    if (!raw || raw === "*" || raw.includes("count") || raw.startsWith("...")) continue
    const embed = /^(?:(\w+):)?(\w+)(?:!\w+)?\s*\((.*)\)$/s.exec(raw)   // [alias:]relation[!fk](inner)
    if (embed) {
      const rel = embed[2]
      if (tbl[rel]) validateSelectText(rel, embed[3], tbl, acc)
      else acc.unknownTables.add(rel)
      continue
    }
    let col = raw.replace(/!inner|!left/g, "").trim()
    if (col.includes("::")) col = col.split("::")[0].trim()           // strip cast first (col::type — valid in a projection)
    if (col.includes(":")) col = col.split(":").pop().trim()          // then alias:real → real
    if (!/^[a-zA-Z_]\w*$/.test(col)) continue                         // json path / computed / expr → skip
    if (!tbl[table].includes(col)) acc.violations.push({ table, col })
  }
  return acc
}

// ── Matchers (pure over sourceFiles + manifest, so the canary can drive each one) ───────────────

/**
 * Run every matcher over the given ts-morph source files against a {tables, rpcs} manifest.
 * Returns { findings, unknown, skipped }. Exported so scripts/__tests__ can assert each matcher fires
 * on a deliberately-wrong fixture (the per-matcher canary, ADDENDUM_SCHEMA_CONTRACT_SCREEN D-7) — a
 * matcher that goes dead in a refactor (as cardinality did) then fails its own test instead of
 * silently reporting 0.
 */
export function scanSourceFiles(sourceFiles, tables, rpcs, Node, SyntaxKind) {
  const findings = []   // { file, kind, table, detail, criticality, severity }
  const unknown = new Set()
  const skipped = { select: 0, filter: 0, write: 0 }   // supabase chains seen but table unresolvable (honest coverage)
  const add = (file, kind, table, detail, severity = "fail") =>
    findings.push({ file, kind, table, detail, criticality: criticality(table), severity })

  // Phantom .from("x") on a table the manifest doesn't have = a non-existent relation (42P01 — worse
  // than a phantom column). The manifest is complete for public tables/views, so this is definitive.
  // Deduped per file+table (one chain hits select + N filters on the same phantom table).
  const seenRel = new Set()
  const flagRelation = (at, table) => {
    const k = `${at.split(":")[0]}::${table}`
    if (seenRel.has(k)) return
    seenRel.add(k)
    add(at, "relation", table, "table/view does not exist")
  }

  /** The initializer of a `const/let q = …` binding, so we can resolve the builder pattern. */
  function bindingInitializer(ident) {
    let sym
    try { sym = ident.getSymbol() } catch { return null }
    for (const d of sym?.getDeclarations() ?? []) {
      if (Node.isVariableDeclaration(d)) return d.getInitializer() ?? null
    }
    return null
  }

  /**
   * Walk the fluent chain down to `.from("literal")`. Resolves the builder pattern
   * (`let q = db.from("x"); q = q.eq(…)`) by following a root identifier to its binding's initializer.
   * Returns the table, or null if genuinely unresolvable (dynamic `.from(var)` / non-literal).
   */
  function fromTable(call) {
    let node = call.getExpression()
    let depth = 0
    while (node && depth++ < 80) {
      if (Node.isPropertyAccessExpression(node)) node = node.getExpression()
      else if (Node.isCallExpression(node)) {
        const callee = node.getExpression()
        if (Node.isPropertyAccessExpression(callee) && callee.getName() === "from") {
          const a = node.getArguments()[0]
          // sawFrom: this IS a supabase chain; table null means dynamic .from(var) → an HONEST skip.
          return { table: a && Node.isStringLiteral(a) ? a.getLiteralText() : null, sawFrom: true }
        }
        node = node.getExpression()
      } else if (Node.isIdentifier(node)) {
        const init = bindingInitializer(node)   // builder pattern: q → `db.from("x")…`
        if (!init) return { table: null, sawFrom: false }
        node = init
      } else return { table: null, sawFrom: false }
    }
    return { table: null, sawFrom: false }
  }

  /** chain takes "one of many" (.order()/.limit()) before .single() → throws-on-0 risk. */
  function chainTakesOneOfMany(call) {
    let node = call.getExpression()
    let depth = 0
    while (node && depth++ < 80) {
      if (Node.isPropertyAccessExpression(node)) node = node.getExpression()
      else if (Node.isCallExpression(node)) {
        const callee = node.getExpression()
        if (Node.isPropertyAccessExpression(callee) && (callee.getName() === "order" || callee.getName() === "limit")) return true
        node = node.getExpression()
      } else return false
    }
    return false
  }

  /**
   * Is a CRITICAL write unnoticed (§5)? Two best-effort shapes: (a) .then()/.catch() swallow, and
   * (b) a bare un-awaited statement — `service.from("x").insert({…})` with no await/assign/return — the
   * MORE common silent-write shape. "Noticed" = awaited / assigned / returned / inside Promise.all([…]).
   */
  function writeIsUnnoticed(writeCall) {
    let node = writeCall
    let depth = 0
    while (depth++ < 14) {
      const parent = node.getParent()
      if (!parent) return false
      if (Node.isAwaitExpression(parent)) return false                 // awaited → noticed (ESLint checks error)
      if (Node.isVariableDeclaration(parent) || Node.isBinaryExpression(parent)
        || Node.isReturnStatement(parent) || Node.isArrayLiteralExpression(parent)) return false  // assigned / returned / Promise.all
      if (Node.isPropertyAccessExpression(parent) && (parent.getName() === "then" || parent.getName() === "catch")) return true  // swallowed
      if (Node.isExpressionStatement(parent)) return true              // bare discarded statement → fire-and-forget
      if (Node.isCallExpression(parent) || Node.isPropertyAccessExpression(parent)) { node = parent; continue }
      return false
    }
    return false
  }

  for (const sf of sourceFiles) {
    const fp = sf.getFilePath()
    if (EXCLUDE.some((re) => re.test(fp))) continue
    const rel = relative(ROOT, fp).replace(/\\/g, "/")

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression()
      if (!Node.isPropertyAccessExpression(callee)) continue
      const method = callee.getName()
      const at = `${rel}:${call.getStartLineNumber()}`

      if (method === "select") {
        const { table, sawFrom } = fromTable(call)
        const a = call.getArguments()[0]
        const hasLiteral = a && (Node.isStringLiteral(a) || Node.isNoSubstitutionTemplateLiteral(a))
        if (table && !tables[table]) { flagRelation(at, table); continue }   // phantom .from("x")
        if (table && hasLiteral) {
          const acc = validateSelectText(table, a.getLiteralText(), tables)
          for (const v of acc.violations) add(at, "select", v.table, v.col)
          for (const u of acc.unknownTables) unknown.add(u)
        } else if (sawFrom && hasLiteral) skipped.select++   // dynamic .from(var) — couldn't attribute
        continue
      }
      if (FILTER_METHODS.has(method)) {
        const { table, sawFrom } = fromTable(call)
        const a = call.getArguments()[0]
        if (!a || !Node.isStringLiteral(a)) continue
        if (!table) { if (sawFrom) skipped.filter++; continue }
        if (!tables[table]) { flagRelation(at, table); continue }
        const lit = a.getLiteralText()
        if (lit.includes(",") || lit.includes("(")) continue
        if (lit.includes("::")) { add(at, "cast", table, lit); continue }
        if (lit.includes(".")) continue
        if (!/^[a-zA-Z_]\w*$/.test(lit)) continue
        if (!tables[table].includes(lit)) add(at, "filter", table, lit)
        continue
      }
      if (WRITE_METHODS.has(method)) {
        const { table, sawFrom } = fromTable(call)
        const a = call.getArguments()[0]
        if (!table) { if (sawFrom && a) skipped.write++; continue }
        if (!tables[table]) { flagRelation(at, table); continue }
        if (!a) continue
        const objs = Node.isArrayLiteralExpression(a) ? a.getElements() : [a]
        for (const obj of objs) {
          if (!Node.isObjectLiteralExpression(obj)) continue
          for (const prop of obj.getProperties()) {
            if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue
            const name = prop.getName()
            if (!name || !/^[a-zA-Z_]\w*$/.test(name)) continue
            if (!tables[table].includes(name)) add(at, "write", table, name)
          }
        }
        if (criticality(table) === "CRITICAL" && writeIsUnnoticed(call)) {
          add(at, "swallow", table, `${method} is best-effort (unawaited / .then / .catch) on a CRITICAL table — must be blocking`)
        }
        continue
      }
      if (method === "rpc") {
        const a = call.getArguments()[0]
        const argObj = call.getArguments()[1]
        if (!a || !Node.isStringLiteral(a)) continue
        const fn = a.getLiteralText()
        if (!rpcs[fn]) { add(at, "rpc-missing", fn, "function does not exist"); continue }
        if (argObj && Node.isObjectLiteralExpression(argObj)) {
          for (const prop of argObj.getProperties()) {
            if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue
            const name = prop.getName()
            if (!name || !/^[a-zA-Z_]\w*$/.test(name)) continue
            if (!rpcs[fn].includes(name)) add(at, "rpc", fn, name)
          }
        }
        continue
      }
      if (method === "single") {
        const { table } = fromTable(call)
        if (table && tables[table] && chainTakesOneOfMany(call)) {
          add(at, "cardinality", table, ".single() after .order()/.limit() — errors (PGRST116) on 0 rows; prefer .maybeSingle() where empty is normal", "warn")
        }
        continue
      }
    }
  }
  return { findings, unknown, skipped }
}

// ── Scanner (runs only when invoked directly) ──────────────────────────────────

async function main() {
  const updateBaseline = process.argv.includes("--update-baseline")
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  const { tables, rpcs } = manifest

  const { Project, SyntaxKind, Node } = await import("ts-morph")
  const project = new Project({ tsConfigFilePath: resolve(ROOT, "tsconfig.json"), skipAddingFilesFromTsConfig: false })
  const { findings, unknown, skipped } = scanSourceFiles(project.getSourceFiles(), tables, rpcs, Node, SyntaxKind)

  // ── Baseline + policy ──
  const keyOf = (f) => `${f.file.split(":")[0]}::${f.kind}::${f.table}::${f.detail}`
  const fails = findings.filter((f) => f.severity === "fail")
  const warns = findings.filter((f) => f.severity === "warn")

  if (updateBaseline) {
    const baselineable = fails.filter((f) => f.criticality !== "CRITICAL")  // CRITICAL + warns never baselined
    const counts = {}
    for (const f of baselineable) counts[keyOf(f)] = (counts[keyOf(f)] ?? 0) + 1
    const sorted = Object.fromEntries(Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((k) => [k, counts[k]]))
    writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n")
    console.log(`✓ baseline updated — ${baselineable.length} NORMAL/HIGH finding(s) baselined (CRITICAL + warns never baselined)`)
    return
  }

  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {}
  const remaining = { ...baseline }
  const blocking = []
  for (const f of fails) {
    if (f.criticality === "CRITICAL") { blocking.push(f); continue }
    const k = keyOf(f)
    if ((remaining[k] ?? 0) > 0) remaining[k]--
    else blocking.push(f)
  }

  console.log("\n🔎  Schema-contract scan")
  console.log("──────────────────────────────────────────────────")
  if (warns.length) {
    console.log(`  ⚠ ${warns.length} cardinality warning(s) — .single() after order/limit (errors on 0 rows; --warnings to list)`)
    if (process.argv.includes("--warnings")) for (const w of warns) console.log(`     ${w.file}  ${w.table}`)
  }
  if (unknown.size) console.log(`  ⚠ ${unknown.size} unknown relation/rpc (not validated): ${[...unknown].slice(0, 8).join(", ")}`)
  // Honest coverage: chains that ARE supabase but whose table couldn't be resolved (dynamic .from(var)).
  // Builder-pattern bindings (let q = db.from("x")) are resolved; what's left here is genuinely dynamic.
  const skips = skipped.select + skipped.filter + skipped.write
  if (skips) console.log(`  ⚠ ${skips} call(s) skipped — dynamic .from(var), unattributable (select ${skipped.select} / filter ${skipped.filter} / write ${skipped.write}). "0 violations" = among resolvable chains.`)

  if (blocking.length === 0) {
    console.log("  ✓ no schema-contract violations (select/filter/write/rpc/cast; CRITICAL un-baselineable; §5 failure-policy)")
    console.log("──────────────────────────────────────────────────")
    return
  }

  for (const tier of ["CRITICAL", "HIGH", "NORMAL"]) {
    const group = blocking.filter((f) => f.criticality === tier)
    if (!group.length) continue
    console.error(`\n  🔴 ${tier} (${group.length}):`)
    for (const f of group.sort((a, b) => a.file.localeCompare(b.file))) {
      console.error(`     ${f.file}  [${f.kind}] ${f.table}.${f.detail}`)
    }
  }
  console.error(`\n${blocking.length} schema-contract violation(s). A phantom column/key/arg/cast errors the whole query at runtime (silent failure); a CRITICAL-table best-effort write must be blocking. CRITICAL findings are never baselineable — fix them. NORMAL/HIGH may be ratcheted with --update-baseline.`)
  console.error("──────────────────────────────────────────────────")
  process.exitCode = 1
}

// Run only when invoked directly (so the test can import the pure parser without running the scan).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
