/**
 * scripts/check-csv-escaping.mjs — every CSV we EMIT must go through the one escaper
 *
 * A cell beginning `=`, `+`, `@`, TAB or CR (or a non-numeric `-`) is EXECUTED by Excel when the file is
 * opened. Pleks stores free text that anyone can type — a tenant's name from the application portal, a
 * contractor's invoice description — so every CSV we emit is a potential delivery mechanism for an attack on
 * our own customer's bookkeeper.
 *
 * A census found FOUR independent hand-rolled CSV builders (reports, admin audit export, trust ledger,
 * waitlist), and not one of them escaped a formula lead. The trust ledger did not even QUOTE its `reference`
 * and `property_name` cells, so a property called "Unit 3, Sea Point" silently shifted every column after it.
 *
 * The fix was one shared helper. THIS is what stops a fifth builder appearing: a file that joins cells with
 * commas and never calls `escapeCsvCell` fails the build.
 *
 * Run: node scripts/check-csv-escaping.mjs   (wired into `npm run check`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SKIP = new Set(["node_modules", ".next", ".git", "test", "dist", "coverage", "scripts"])

/**
 * Files that legitimately build CSV-ish strings without needing the escaper. Each entry states WHY — an
 * allowlist without a reason is just a silenced test.
 */
const ALLOW = new Map([
  ["lib/security/csvInjection.ts", "IS the escaper"],
  ["lib/import/parseGLReport.ts", "PARSES csv (inbound), never emits it"],
  ["lib/recon/csvBankParser.ts", "PARSES a bank statement (inbound)"],
  // Routes that set a text/csv content-type but DELEGATE the cell-building to an escaped builder. They hand
  // back a finished string; they never touch a cell themselves.
  ["app/api/reports/export/route.ts", "delegates to lib/reports/exportCSV (escaped)"],
  ["app/api/cron/process-audit-exports/route.ts", "delegates to lib/admin/csv-export (escaped)"],
  ["app/(dashboard)/finance/trust-ledger/page.tsx", "delegates to lib/finance/trustLedger:buildTrustLedgerCSV (escaped)"],
  ["app/(dashboard)/settings/import/_components/Step0Upload.tsx", "INBOUND — accept=\"text/csv\" on an upload input"],
])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec|dbtest)\./.test(name)) yield full
  }
}

/**
 * Does this file EMIT a CSV?
 *
 * Deliberately narrow. The first version flagged any file containing `join(",")` — which caught a component
 * joining class names for display and an upload input whose `accept` attribute mentions `.csv`. A detector that
 * cries wolf gets switched off, and this one has to survive contact with a codebase for years.
 *
 * An emitter serves a `text/csv` payload, unparses with papaparse, or has a function that BUILDS a CSV.
 */
const EMITS_CSV = [
  /text\/csv/i,
  /Papa\.unparse/,
  /(?:build|to|make|stream)\w*CSV\s*\(/i,
]

const offenders = []

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8")
  const rel = relative(ROOT, file).replaceAll("\\", "/")
  if (ALLOW.has(rel)) continue

  if (!EMITS_CSV.some((re) => re.test(src))) continue

  // A CALL, not a mention. The first version accepted any file CONTAINING the string "escapeCsvCell" — which
  // an unused `import { escapeCsvCell }` satisfies perfectly. And that is exactly what happened: a botched edit
  // added the import to two files without replacing their escaper bodies, the fix was inert, and this check
  // went green on the strength of the import line alone. A guard that its own subject can satisfy by accident
  // is not a guard.
  const body = src.replaceAll(/^import[\s\S]*?from\s+["'][^"']+["']\s*$/gm, "")
  if (/escapeCsvCell\s*\(/.test(body)) continue        // routed through the SSOT

  offenders.push(rel)
}

const rule = "─".repeat(92)
console.log("\n🔎  CSV exports must escape formula leads")
console.log(rule)

if (offenders.length) {
  console.error(`  ✗ ${offenders.length} file(s) emit CSV without going through escapeCsvCell().`)
  console.error(`    A cell starting = + @ (or a non-numeric -) is EXECUTED by Excel when the agency's`)
  console.error(`    bookkeeper opens the export. Import lib/security/csvInjection and escape every cell.`)
  for (const o of offenders) console.error(`      • ${o}`)
  console.log(rule)
  process.exit(1)
}

console.log("  ✓ every CSV emitter routes its cells through escapeCsvCell()")
console.log(rule)
