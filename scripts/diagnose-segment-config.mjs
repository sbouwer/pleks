#!/usr/bin/env node
/**
 * scripts/diagnose-segment-config.mjs — Replicates Next.js 16's per-file segment-config validation
 *
 * Run with:  node scripts/diagnose-segment-config.mjs
 *
 * Walks every routable file in app/ AND root-level files Next.js validates
 * (proxy.ts, instrumentation.ts), parses the AST, and reports any export that
 * Next.js 16's page-data collector would flag — output goes to stdout serially
 * so per-file errors aren't eaten by worker buffering.
 *
 * What it catches:
 *   - Custom exports in page/layout/route files (only specific names allowed)
 *   - Pages-Router-style `export const config = {...}` left in App Router files
 *   - Invalid segment-config values (runtime="node", revalidate="always", etc.)
 *   - Non-literal segment-config / matcher values (String.raw, BinaryExpression,
 *     identifier references, etc.) — the silent killer that hides behind the
 *     generic "Invalid segment configuration export detected" message
 *   - generateStaticParams / generateMetadata in routes (not allowed there)
 *
 * What it can't catch (would need runtime execution):
 *   - Type-level violations TypeScript would catch (we run after tsc passes anyway)
 */
import fs from "node:fs"
import path from "node:path"
import url from "node:url"
import ts from "typescript"

const __filename = url.fileURLToPath(import.meta.url)
const ROOT       = path.resolve(path.dirname(__filename), "..")
const APP_DIR    = path.join(ROOT, "app")

// ── Allowed exports per file type ─────────────────────────────────────────────
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

const SEGMENT_CONFIG_KEYS = [
  "runtime", "dynamic", "dynamicParams", "revalidate", "fetchCache",
  "preferredRegion", "maxDuration", "experimental_ppr",
]

const PAGE_LAYOUT_EXPORTS = [
  "default", "metadata", "viewport",
  "generateMetadata", "generateViewport", "generateStaticParams",
  ...SEGMENT_CONFIG_KEYS,
]

const ROUTE_EXPORTS = [
  ...HTTP_METHODS,
  ...SEGMENT_CONFIG_KEYS,
]

const SIMPLE_DEFAULT_ONLY = ["default"]

const ALLOWED = {
  page:        new Set(PAGE_LAYOUT_EXPORTS),
  layout:      new Set(PAGE_LAYOUT_EXPORTS),
  template:    new Set(PAGE_LAYOUT_EXPORTS),
  route:       new Set(ROUTE_EXPORTS),
  error:       new Set([...SIMPLE_DEFAULT_ONLY, ...SEGMENT_CONFIG_KEYS]),
  "global-error": new Set(SIMPLE_DEFAULT_ONLY),
  loading:     new Set(SIMPLE_DEFAULT_ONLY),
  "not-found": new Set([...SIMPLE_DEFAULT_ONLY, ...SEGMENT_CONFIG_KEYS]),
  default:     new Set(SIMPLE_DEFAULT_ONLY),
  sitemap:     new Set(["default", "generateSitemaps", ...SEGMENT_CONFIG_KEYS]),
  robots:      new Set(["default"]),
  manifest:    new Set(["default"]),
  icon:        new Set(["default", "generateImageMetadata", "size", "contentType", "alt"]),
  "apple-icon":         new Set(["default", "generateImageMetadata", "size", "contentType", "alt"]),
  "opengraph-image":    new Set(["default", "generateImageMetadata", "size", "contentType", "alt"]),
  "twitter-image":      new Set(["default", "generateImageMetadata", "size", "contentType", "alt"]),

  // Root-level files Next.js validates outside app/.
  // proxy: must export `proxy` (named) or `default`, plus optionally `config` (matcher object).
  // matcher MUST be a literal string or array-of-literal-strings — String.raw, identifiers,
  // and computed values trigger "Invalid segment configuration export detected".
  proxy: new Set(["proxy", "default", "config"]),
  // instrumentation: register + onRequestError are the standard exports.
  instrumentation: new Set(["register", "onRequestError"]),
}

// ── Segment config value validators ──────────────────────────────────────────
const VALIDATORS = {
  runtime:        v => ["nodejs", "edge"].includes(v) ? null : `must be "nodejs" or "edge", got ${JSON.stringify(v)}`,
  dynamic:        v => ["auto", "force-dynamic", "error", "force-static"].includes(v) ? null : `must be one of auto/force-dynamic/error/force-static, got ${JSON.stringify(v)}`,
  dynamicParams:  v => typeof v === "boolean" ? null : `must be boolean, got ${typeof v}`,
  revalidate:     v => v === false || (typeof v === "number" && v >= 0) ? null : `must be false or non-negative number, got ${JSON.stringify(v)}`,
  fetchCache:     v => ["auto","default-cache","only-cache","force-cache","force-no-store","default-no-store","only-no-store"].includes(v) ? null : `invalid fetchCache value: ${JSON.stringify(v)}`,
  preferredRegion: v => typeof v === "string" || Array.isArray(v) ? null : `must be string or string[], got ${typeof v}`,
  maxDuration:    v => typeof v === "number" && v > 0 ? null : `must be positive number, got ${JSON.stringify(v)}`,
}

// ── File-type detection ───────────────────────────────────────────────────────
function fileTypeOf(filePath) {
  const base = path.basename(filePath).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, "")
  return Object.keys(ALLOWED).includes(base) ? base : null
}

// ── Tree walk ────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|jsx)$/i.test(e.name)) out.push(full)
  }
  return out
}

// ── AST walker for top-level exports ─────────────────────────────────────────
function readExports(filePath) {
  const source = fs.readFileSync(filePath, "utf-8")
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    /\.tsx?$/i.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const exports = []

  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) ?? [] : []
    const isExported = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault  = mods.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)

    // export [default] const|let|var foo = ...
    if (isExported && ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exports.push({
            name: decl.name.text,
            kind: "const",
            initializer: decl.initializer,
            line: sf.getLineAndCharacterOfPosition(decl.name.pos).line + 1,
          })
        }
      }
    }
    // export [default] function foo() { ... }
    else if (isExported && ts.isFunctionDeclaration(stmt) && stmt.name) {
      exports.push({
        name: isDefault ? "default" : stmt.name.text,
        kind: "function",
        line: sf.getLineAndCharacterOfPosition(stmt.name.pos).line + 1,
      })
    }
    // export default <expression>
    else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      exports.push({
        name: "default",
        kind: "default-expr",
        line: sf.getLineAndCharacterOfPosition(stmt.pos).line + 1,
      })
    }
    // export { foo, bar as baz }
    else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const spec of stmt.exportClause.elements) {
        exports.push({
          name: spec.name.text,
          kind: "re-export",
          line: sf.getLineAndCharacterOfPosition(spec.name.pos).line + 1,
        })
      }
    }
    // export class Foo { ... }
    else if (isExported && ts.isClassDeclaration(stmt) && stmt.name) {
      exports.push({
        name: isDefault ? "default" : stmt.name.text,
        kind: "class",
        line: sf.getLineAndCharacterOfPosition(stmt.name.pos).line + 1,
      })
    }
    // export type Foo = ... / export interface Foo { ... } — type-only, ignored
  }

  return exports
}

// ── Try to extract a literal value from an initializer ───────────────────────
function literalValue(init) {
  if (!init) return { kind: "missing" }
  if (ts.isStringLiteral(init)) return { kind: "literal", value: init.text }
  if (ts.isNumericLiteral(init)) return { kind: "literal", value: Number(init.text) }
  // Plain (non-tagged) template literal with no substitutions — equivalent to a string literal
  if (ts.isNoSubstitutionTemplateLiteral(init)) return { kind: "literal", value: init.text }
  if (init.kind === ts.SyntaxKind.TrueKeyword)  return { kind: "literal", value: true  }
  if (init.kind === ts.SyntaxKind.FalseKeyword) return { kind: "literal", value: false }
  if (init.kind === ts.SyntaxKind.NullKeyword)  return { kind: "literal", value: null  }
  if (ts.isArrayLiteralExpression(init)) {
    const items = init.elements.map(literalValue)
    if (items.every(i => i.kind === "literal")) {
      return { kind: "literal", value: items.map(i => i.value) }
    }
  }
  if (ts.isObjectLiteralExpression(init)) {
    const obj = {}
    for (const prop of init.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) return { kind: "non-literal", text: init.getText().slice(0, 80) }
      const key = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : null
      if (!key) return { kind: "non-literal", text: init.getText().slice(0, 80) }
      const val = literalValue(prop.initializer)
      if (val.kind !== "literal") return { kind: "non-literal", text: init.getText().slice(0, 80), nonLiteralKey: key, nonLiteralText: val.text }
      obj[key] = val.value
    }
    return { kind: "literal", value: obj }
  }
  // Tagged template (String.raw`...`), identifier reference, function call, binary expr,
  // conditional expr, etc.: all non-literal.
  return { kind: "non-literal", text: init.getText().slice(0, 80) }
}

// ── Validate proxy.ts config.matcher specifically ────────────────────────────
function validateProxyMatcher(initializer, file, line, issues) {
  // Drill into config = { matcher: ... }
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return
  for (const prop of initializer.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue
    const key = ts.isIdentifier(prop.name) ? prop.name.text : null
    if (key !== "matcher") continue

    const matcherInit = prop.initializer
    const lit = literalValue(matcherInit)
    if (lit.kind === "non-literal") {
      const matcherLine = matcherInit
        ? matcherInit.getSourceFile().getLineAndCharacterOfPosition(matcherInit.pos).line + 1
        : line
      issues.push({
        file,
        line: matcherLine,
        export: "config.matcher",
        kind: "matcher",
        ftype: "proxy",
        value: lit.text,
        problem: `proxy.ts \`config.matcher\` is non-literal (likely String.raw, identifier, or computed). Next.js 16 statically analyzes the matcher and rejects non-literal AST nodes with the generic "Invalid segment configuration export detected" message. Use a plain string or array of plain strings.`,
      })
    }
  }
}

// ── Main scan ────────────────────────────────────────────────────────────────
const allFiles    = walk(APP_DIR)
const routableFiles = allFiles.filter(f => fileTypeOf(f))

// Add root-level files Next.js validates
const rootFiles = ["proxy.ts", "proxy.js", "instrumentation.ts", "instrumentation.js"]
  .map(f => path.join(ROOT, f))
  .filter(f => fs.existsSync(f))

const filesToScan = [...routableFiles, ...rootFiles]

const issues = []
const summary = {
  totalFiles: allFiles.length,
  routableFiles: routableFiles.length,
  rootFiles: rootFiles.length,
}

for (const file of filesToScan) {
  const ftype   = fileTypeOf(file)
  const allowed = ALLOWED[ftype]
  if (!allowed) continue
  const exports = readExports(file)
  const rel     = path.relative(ROOT, file).replace(/\\/g, "/")

  for (const exp of exports) {
    // Custom export not in allowed list?
    if (!allowed.has(exp.name)) {
      issues.push({
        file: rel,
        line: exp.line,
        export: exp.name,
        kind: exp.kind,
        ftype,
        problem: `Custom export "${exp.name}" not allowed in ${ftype} files`,
      })
    }

    // Validate segment config values
    if (SEGMENT_CONFIG_KEYS.includes(exp.name) && exp.kind === "const") {
      const lit = literalValue(exp.initializer)
      if (lit.kind === "literal") {
        const validator = VALIDATORS[exp.name]
        if (validator) {
          const err = validator(lit.value)
          if (err) {
            issues.push({
              file: rel,
              line: exp.line,
              export: exp.name,
              kind: exp.kind,
              ftype,
              value: JSON.stringify(lit.value),
              problem: `Invalid segment config value: ${err}`,
            })
          }
        }
      } else if (lit.kind === "non-literal") {
        issues.push({
          file: rel,
          line: exp.line,
          export: exp.name,
          kind: exp.kind,
          ftype,
          value: lit.text,
          problem: `Segment config "${exp.name}" is not statically analyzable — Next.js requires a literal value (string/number/array of literals). Tagged templates like String.raw, identifier references, and binary expressions are rejected.`,
        })
      }
    }

    // Specific check: proxy.ts `export const config = { matcher: ... }` — matcher must be literal
    if (ftype === "proxy" && exp.name === "config" && exp.kind === "const") {
      validateProxyMatcher(exp.initializer, rel, exp.line, issues)
    }

    // Specific check: `export const config = {...}` is the Pages Router pattern in app/ files
    if (exp.name === "config" && ftype !== "proxy") {
      issues.push({
        file: rel,
        line: exp.line,
        export: "config",
        kind: exp.kind,
        ftype,
        problem: `\`export const config\` is a Pages Router pattern — App Router routes use individual exports (runtime, dynamic, etc.). This is the most common cause of "Invalid segment configuration export detected".`,
      })
    }
  }
}

// ── Print report ─────────────────────────────────────────────────────────────
console.log("")
console.log("─".repeat(72))
console.log(`Pleks segment-config diagnostic`)
console.log("─".repeat(72))
console.log(`Scanned:  ${summary.totalFiles} files in app/ + ${summary.rootFiles} root-level files`)
console.log(`Routable: ${summary.routableFiles + summary.rootFiles} (page/layout/route/proxy/instrumentation/etc.)`)
console.log("")

if (issues.length === 0) {
  console.log("✓ No issues found by static analysis.")
  console.log("")
  console.log("If `next build` is still failing, the cause is one of:")
  console.log("  · A misconfiguration in next.config.ts (Sentry / Serwist wrappers)")
  console.log("  · A non-literal value inside a transitively imported file")
  console.log("  · A Next.js version regression — try pinning to a known-good version")
  console.log("")
  process.exit(0)
}

const errors   = issues.filter(i => i.severity !== "warning")
const warnings = issues.filter(i => i.severity === "warning")

if (errors.length) {
  console.log(`✗ ${errors.length} error(s):`)
  console.log("")
  for (const i of errors) {
    console.log(`  ${i.file}:${i.line}`)
    console.log(`    ${i.problem}`)
    console.log(`    Export: ${i.export} (${i.kind})  File type: ${i.ftype}`)
    if (i.value !== undefined) console.log(`    Value:  ${i.value}`)
    console.log("")
  }
}

if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s) — these may or may not break the build:`)
  console.log("")
  for (const i of warnings) {
    console.log(`  ${i.file}:${i.line}`)
    console.log(`    ${i.problem}`)
    console.log(`    Export: ${i.export}  Value: ${i.value}`)
    console.log("")
  }
}

process.exit(errors.length ? 1 : 0)
