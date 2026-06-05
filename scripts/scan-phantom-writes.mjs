/**
 * scripts/scan-phantom-writes.mjs — build gate: phantom columns in .insert()/.update() object keys
 *
 * The select + filter validators don't see write payloads. A phantom column in an insert/update object
 * → 42703 at runtime → the whole write silently fails (the F0 audit-log class). This scans top-level
 * object keys in .from("literal").insert({...}) / .update({...}) against schema-columns.json.
 * Spread keys (...x) and dynamic objects are skipped (can't resolve statically). Run: node scripts/scan-phantom-writes.mjs
 */
import { readFileSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const EXCLUDE = [/node_modules/, /\.next/, /[\\/]scripts[\\/]/, /[\\/]eslint-rules[\\/]/, /\.d\.ts$/, /\.test\./, /\.spec\./]

const { Project, SyntaxKind, Node } = await import("ts-morph")
const manifest = JSON.parse(readFileSync(resolve(__dirname, "schema-columns.json"), "utf8"))
const project = new Project({ tsConfigFilePath: resolve(ROOT, "tsconfig.json"), skipAddingFilesFromTsConfig: false })

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
    if (!Node.isPropertyAccessExpression(callee)) continue
    const method = callee.getName()
    if (method !== "insert" && method !== "update") continue
    const table = fromTable(call)
    if (!table || !manifest[table]) continue
    const arg = call.getArguments()[0]
    if (!arg) continue
    // insert may take an array of objects; update takes one object.
    const objs = Node.isArrayLiteralExpression(arg) ? arg.getElements() : [arg]
    for (const obj of objs) {
      if (!Node.isObjectLiteralExpression(obj)) continue // variable / spread-built → skip
      for (const prop of obj.getProperties()) {
        if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue
        const name = prop.getName()
        if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) continue // skip computed/quoted keys ([x], "x")
        if (!manifest[table].includes(name)) {
          hits.push(`${rel}:${call.getStartLineNumber()}  ${table}.${name}  (.${method})`)
        }
      }
    }
  }
}

if (hits.length) {
  console.error([...new Set(hits)].sort().join("\n"))
  console.error(`\n🔴 ${hits.length} phantom write column(s) — an insert/update with a non-existent column 42703s at runtime → the whole write silently fails (the F0 class). Fix the column name. See scripts/scan-phantom-writes.mjs.`)
  process.exit(1)
}
console.log("✓ no phantom write columns")
