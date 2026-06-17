/**
 * scripts/security/check-pii-classification.mts — CI ratchet: every PII column must be classified
 *
 * Generalises the P-1 fix (erasure orphan-PII) into a standing gate. A column whose name matches a personal-data
 * pattern must be in ONE of:
 *   • the erasure STRIP-SET (anonymisePlan.ts ANONYMISE_PLAN — redacted/nulled on a POPIA erasure),
 *   • the ACCOUNTABILITY-SET (tables retained per POPIA s17 — audit/consent/auth trail, never stripped),
 *   • a MANUAL-REVIEW table (free-text/incidental PII a human actions — anonymiseIdentity MANUAL_REVIEW_TARGETS).
 * Otherwise the build fails. This stops the drift class behind P-1 / F-3 / the auth-event gaps: a new PII column
 * added without wiring it into erasure. The current uncovered set (incl. non-personal columns the name pattern
 * also catches) is baseline-grandfathered so debt only shrinks; the ratchet fails on a NEW uncovered PII column,
 * and forces the baseline down as columns get classified.
 *
 *   tsx scripts/security/check-pii-classification.mts                    # CI check (in `npm run check`)
 *   tsx scripts/security/check-pii-classification.mts --update-baseline  # re-record the grandfathered set
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { ANONYMISE_PLAN } from "../../lib/popia/anonymisePlan"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const BASELINE_PATH = join(ROOT, "scripts", "security", "pii-classification.baseline.json")
const UPDATE = process.argv.includes("--update-baseline")

// Column-name patterns that denote personal data (POPIA data-subject identity / contact / financial signals).
const PII_PATTERNS: RegExp[] = [
  /id_number/, /(^|_)id_no($|_)/, /passport/, /date_of_birth/, /(^|_)dob($|_)/, /id_document/,
  /first_name/, /last_name/, /full_name/, /surname/, /maiden/, /(^|_)gender/, /nationality/, /marital/,
  /(^|_)email/, /(^|_)phone/, /mobile/, /(^|_)cell($|_)/, /next_of_kin/,
  /account_number/, /account_holder/, /branch_code/, /(^|_)iban/, /tax_number/,
  /employer/, /occupation/, /salary/, /(gross_)?monthly_income/, /(^|_)signature/, /ip_address/,
]
// Suffixes/markers that mean a flag / status / metadata column, not the PII value itself (cut heuristic noise).
const PII_EXCLUSIONS: RegExp[] = [
  /_status$/, /_at$/, /_count$/, /_verified$/, /_verification/, /_reconciliation/, /_given$/, /_version$/,
  /_enabled$/, /_sent$/, /_required$/, /_type$/, /preference/, /cell_signal/, /_cost/,
]
const isPII = (col: string): boolean =>
  PII_PATTERNS.some((re) => re.test(col)) && !PII_EXCLUSIONS.some((re) => re.test(col))

// 1. STRIP-SET — (table.col) pairs the erasure plan redacts/nulls.
const stripSet = new Set<string>()
for (const g of ANONYMISE_PLAN) for (const col of Object.keys(g.fields ?? {})) stripSet.add(`${g.table}.${col}`)

// 2. ACCOUNTABILITY-SET — whole tables retained per POPIA s17 (lawful-basis / audit trail; never stripped).
const ACCOUNTABILITY_TABLES = new Set<string>([
  "audit_log", "consent_log", "tos_acceptances", "auth_events", "data_subject_requests",
  "login_notifications_sent", "device_fingerprints", "trust_account_records",
])

// 3. MANUAL-REVIEW tables — free-text/incidental PII a human actions (mirror of anonymiseIdentity MANUAL_REVIEW_TARGETS;
//    hardcoded so this script imports only the dependency-free anonymisePlan, not the server-coupled identity module).
const MANUAL_REVIEW_TABLES = new Set<string>([
  "communication_log", "maintenance_requests", "document_generation_jobs", "warranties", "screening_artifacts",
])

// Tables that aren't data-subject PII storage: notification toggles, usage counters, and intentional honeytokens.
const NON_PII_TABLES = new Set<string>([
  "communication_preferences", "messaging_usage", "honeytoken_emails",
])

const manifest = JSON.parse(readFileSync(join(ROOT, "scripts", "schema-manifest.json"), "utf8")) as {
  tables: Record<string, string[]>
}

const uncovered: string[] = []
for (const [table, cols] of Object.entries(manifest.tables)) {
  if (table.endsWith("_view")) continue // views derive from base tables — erasure classifies the base columns
  if (ACCOUNTABILITY_TABLES.has(table) || MANUAL_REVIEW_TABLES.has(table) || NON_PII_TABLES.has(table)) continue
  for (const col of cols) {
    if (isPII(col) && !stripSet.has(`${table}.${col}`)) uncovered.push(`${table}.${col}`)
  }
}
uncovered.sort((a, b) => a.localeCompare(b))

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(uncovered, null, 2) + "\n", "utf8")
  console.log(`PII baseline updated: ${uncovered.length} uncovered PII-pattern column(s) grandfathered.`)
  process.exit(0)
}

const baseline: string[] = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
const baselineSet = new Set(baseline)
const currentSet = new Set(uncovered)
const added = uncovered.filter((k) => !baselineSet.has(k))   // a NEW uncovered PII column
const fixed = baseline.filter((k) => !currentSet.has(k))     // baselined col now classified/removed → shrink

let failed = false
if (added.length) {
  failed = true
  console.error(`\n✗ ${added.length} new PII-pattern column(s) not classified — add to the erasure strip-set (anonymisePlan), the accountability/manual-review set, or baseline if non-personal:`)
  for (const k of added) console.error(`    ${k}`)
}
if (fixed.length) {
  failed = true
  console.error(`\n✗ ${fixed.length} baselined PII column(s) are now classified/removed — the ratchet only shrinks. Re-record:`)
  console.error(`    tsx scripts/security/check-pii-classification.mts --update-baseline`)
  for (const k of fixed) console.error(`    (covered/removed) ${k}`)
}

if (failed) process.exit(1)
console.log(`✓ PII classification: no new unclassified PII columns (${baseline.length} grandfathered, burning down)`)
