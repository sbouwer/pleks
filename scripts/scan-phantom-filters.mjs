/**
 * scripts/scan-phantom-filters.mjs — one-off hunt: phantom columns in FILTER methods
 *
 * The column validator only checks .select(); a phantom column in .eq()/.is()/.order()/etc. errors the
 * WHOLE query at runtime → silent failure (the is_primary / type bugs). This scans filter-method column
 * literals against schema-columns.json the same way. Run: node scripts/scan-phantom-filters.mjs
 */
import { readFileSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const FILTER_METHODS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "not", "order", "filter",
])
const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\./, /\.spec\./]

const { Project, SyntaxKind, Node } = await import("ts-morph")
const manifest = JSON.parse(readFileSync(resolve(__dirname, "schema-columns.json"), "utf8"))
const project = new Project({ tsConfigFilePath: resolve(ROOT, "tsconfig.json"), skipAddingFilesFromTsConfig: false })

/** Walk a filter call's object chain to the nearest `.from("literal")` table (skips .select/.eq/etc). */
function fromTable(call) {
  let node = call.getExpression()
  let depth = 0
  while (node && depth++ < 80) {
    if (Node.isPropertyAccessExpression(node)) node = node.getExpression()
    else if (Node.isCallExpression(node)) {
      const callee = node.getExpression()
      if (Node.isPropertyAccessExpression(callee) && callee.getName() === "from") {
        const arg = node.getArguments()[0]
        return arg && Node.isStringLiteral(arg) ? arg.getLiteralText() : null
      }
      node = node.getExpression()
    } else return null
  }
  return null
}

const hits = []
for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath()
  if (EXCLUDE.some((re) => re.test(fp))) continue
  const rel = relative(ROOT, fp).replace(/\\/g, "/")
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression()
    if (!Node.isPropertyAccessExpression(callee) || !FILTER_METHODS.has(callee.getName())) continue
    const table = fromTable(call)
    if (!table || !manifest[table]) continue
    const a0 = call.getArguments()[0]
    if (!a0 || !Node.isStringLiteral(a0)) continue
    const col = a0.getLiteralText()
    if (col.includes(".") || col.includes(",") || col.includes("(")) continue // embed/order-list/expr — skip
    if (!manifest[table].includes(col)) {
      hits.push(`${rel}:${call.getStartLineNumber()}  ${table}.${col}  (.${callee.getName()})`)
    }
  }
}

console.log(hits.length ? hits.sort().join("\n") : "✓ no phantom filter columns")
console.log(`\n${hits.length} phantom filter column(s)`)
