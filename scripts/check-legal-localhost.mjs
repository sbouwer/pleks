/**
 * scripts/check-legal-localhost.mjs — guard against localhost URLs in legal pages
 *
 * Run as part of npm run check. Fails with exit code 1 if any source file under
 * app/(public)/ or components/legal/ contains a literal localhost URL.
 * Legal pages must always use pleks.co.za (or relative paths).
 */
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

const SCAN_DIRS = [
  "app/(public)",
  "components/legal",
]

const PATTERN = /localhost/

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) files.push(full)
  }
  return files
}

let failures = 0
for (const base of SCAN_DIRS) {
  let files
  try { files = walk(base) } catch { continue }
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    const lines = src.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (PATTERN.test(lines[i])) {
        console.error(`[legal-localhost] ${file}:${i + 1} — contains "localhost"`)
        console.error(`  ${lines[i].trim()}`)
        failures++
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} localhost reference(s) found in legal pages. Replace with https://pleks.co.za or a relative path.`)
  process.exit(1)
} else {
  console.log("[legal-localhost] OK — no localhost URLs in legal pages")
}
