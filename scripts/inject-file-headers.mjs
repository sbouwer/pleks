/**
 * scripts/inject-file-headers.mjs
 *
 * Scans source files and injects a stub header when one is missing.
 * The stub contains the file path (auto-filled) and FILL placeholders
 * for purpose, auth, data source, and notes.
 *
 * Usage:
 *   node scripts/inject-file-headers.mjs              # dry run (shows what would change)
 *   node scripts/inject-file-headers.mjs --write      # writes files
 *   node scripts/inject-file-headers.mjs --write app/lib   # target a subdirectory
 *
 * After running --write, fill in the FILL lines in each file.
 * Re-running is safe — files that already have a header are skipped.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, extname } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "").replace(/^\/([A-Za-z]:)/, "$1")
const DRY_RUN = !process.argv.includes("--write")
const TARGET_ARG = process.argv.find((a, i) => i > 1 && !a.startsWith("--"))
const TARGET_DIR = TARGET_ARG ? join(ROOT, TARGET_ARG) : ROOT

// Directories that are never worth scanning
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".claude", "dist", "out", ".turbo",
  "public", "coverage", "storybook-static", "scripts",
])

// Files already handled or not worth headers
const SKIP_FILES = new Set([
  "next.config.ts", "next.config.js", "next-env.d.ts",
  "postcss.config.mjs", "tailwind.config.ts",
  "jest.config.ts", "vitest.config.ts",
  "docker-compose.yml", "docker-compose.yaml",
])

const TS_EXTENSIONS  = new Set([".ts", ".tsx"])
const YML_EXTENSIONS = new Set([".yml", ".yaml"])

// ── Marker: if the first non-blank, non-directive line starts with this, skip ──
function hasHeader(content) {
  const lines = content.split("\n")
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    // Skip "use client" / "use server" directives
    if (t === '"use client"' || t === '"use server"') continue
    // Has a header if first substantive line is a comment block
    return t.startsWith("/**") || t.startsWith("/*") || t.startsWith("//") || t.startsWith("#")
  }
  return false
}

// True if the file looks like a generated type file, re-export barrel, or config stub
function isBoilerplate(content) {
  const trimmed = content.trim()
  return (
    trimmed.length < 80 ||           // tiny file — nothing worth documenting
    trimmed.startsWith("export {")   // re-export barrel
  )
}

function buildTsHeader(relPath) {
  return [
    "/**",
    ` * ${relPath} — FILL: one-line purpose`,
    " *",
    " * FILL: fill in relevant fields and delete unused ones:",
    " * Route:  /the/url/this/renders",
    " * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)",
    " * Data:   where data comes from, any non-obvious access pattern",
    " * Notes:  gotchas, invariants, why-not-X decisions",
    " */",
    "",
  ].join("\n")
}

function buildYmlHeader(relPath) {
  return [
    `# ${relPath} — FILL: one-line purpose`,
    "#",
    "# FILL: fill in relevant fields and delete unused ones:",
    "# Trigger: on push / pull_request / schedule / etc.",
    "# Auth:    secrets or permissions required",
    "# Notes:   gotchas or non-obvious decisions",
    "",
  ].join("\n")
}

function processFile(absPath) {
  const relPath = relative(ROOT, absPath).replaceAll("\\", "/")
  const ext = extname(absPath)
  const isTs  = TS_EXTENSIONS.has(ext)
  const isYml = YML_EXTENSIONS.has(ext)

  if (!isTs && !isYml) return

  const original = readFileSync(absPath, "utf8")

  if (hasHeader(original)) return
  if (isBoilerplate(original)) return

  let updated

  if (isTs) {
    // "use client" / "use server" must stay as the very first line in Next.js
    const firstLine = original.split("\n")[0].trim()
    const directive = firstLine === '"use client"' || firstLine === '"use server"'
      ? original.split("\n")[0] + "\n\n"
      : ""
    const rest = directive ? original.split("\n").slice(1).join("\n").replace(/^\n+/, "") : original
    updated = directive + buildTsHeader(relPath) + rest
  } else {
    updated = buildYmlHeader(relPath) + original
  }

  if (DRY_RUN) {
    console.log(`  would inject: ${relPath}`)
  } else {
    writeFileSync(absPath, updated, "utf8")
    console.log(`  injected:     ${relPath}`)
  }
}

function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }

  for (const name of entries) {
    if (SKIP_FILES.has(name)) continue
    const abs = join(dir, name)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(abs)
    } else {
      processFile(abs)
    }
  }
}

console.log(DRY_RUN
  ? "Dry run — pass --write to apply changes\n"
  : "Writing headers...\n"
)
walk(TARGET_DIR)
console.log("\nDone.")
