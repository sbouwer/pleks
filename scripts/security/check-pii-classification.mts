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
  // CD PII-disposition 2026-07-07 (Group A — non-PII the name pattern catches):
  /requires_signature/,   // a boolean flag, not a signature value
  /levy_account/,         // the property/scheme levy account — a property attribute, not a person's bank account
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
  // CD PII-disposition 2026-07-07:
  "organisations",       // Group B — the operator's own (Responsible-Party) identity, NOT data-subject PII a tenant/
                         // landlord erasure may strip. Basis: service contract s11(1)(b) + operational/audit + PPRA
                         // (property-practitioner identity ↔ trust accounts). FOLLOW-UP: account-closure erasure path
                         // is the required retention endpoint (tracked) — accountability must not mean "forever" (s14).
  "bank_accounts",       // Group D — the agency's OWN trust/operating/PPRA accounts (type ∈ trust|business|deposit_holding|
                         // ppra_trust, org_id-keyed); PPRA/FICA require retention. Never a tenant/landlord subject account.
  "municipal_accounts",  // Group D — a property utility account (property_id NOT NULL); property attribute, not a subject
                         // record. A natural-person owner name exercising erasure is handled via the manual-review path.
  "popia_exports",       // Group C — the DSAR-handled proof (subject_email = who requested an export); can't strip who
                         // asked. Retain with a purge clock (period → counsel; P-3 follow-up).
  "invites",             // Group C — operational/audit artifact (email of the invited party); purge consumed/expired
                         // invites after a documented period (period → counsel; P-3 follow-up).
])

// 3. MANUAL-REVIEW tables — free-text/incidental PII a human actions (mirror of anonymiseIdentity MANUAL_REVIEW_TARGETS;
//    hardcoded so this script imports only the dependency-free anonymisePlan, not the server-coupled identity module).
const MANUAL_REVIEW_TABLES = new Set<string>([
  "communication_log", "maintenance_requests", "document_generation_jobs", "warranties", "screening_artifacts",
  "contractors",         // CD PII-disposition 2026-07-07 (Group C) — supplier-subject PII; human-actioned until the
                         // supplier-erasure cascade ships (v1.1, D-14). Mirrored in anonymiseIdentity MANUAL_REVIEW_TARGETS.
  "hoa_unit_owners",     // CD PII-disposition 2026-07-07 (overrides the initial RETENTION-PURGE placement) — an HOA unit
                         // owner is ACTIVE-RELATIONSHIP subject PII: lawful basis (STSMA / scheme management) to retain
                         // while they own the unit (can be decades). Erasure is EVENT-driven (ceasing ownership) or a
                         // DSAR — NOT time-elapsed, so a retention-purge clock would wrongly auto-delete live owners.
                         // Human-actioned now; FOLLOW-UP: build an event-driven owner-erasure routine when HOA activates.
  "lease_sureties",      // LEG-NOTICES-01 A (disposition by analogy to hoa_unit_owners — flag to CD) — a surety of record
                         // is ACTIVE-RELATIONSHIP subject PII bound by a deed of suretyship: live contractual/accountability
                         // basis (s17) to retain while the suretyship binds. Erase on release (released_at) / lease end or
                         // DSAR — NOT by time or an unrelated tenant erasure (auto-strip would break a live legal instrument).
])

// Tables that aren't data-subject PII storage: notification toggles, usage counters, and intentional honeytokens.
const NON_PII_TABLES = new Set<string>([
  "communication_preferences", "messaging_usage", "honeytoken_emails",
  // CD PII-disposition 2026-07-07 (EXCLUDE — org-operational config / transient infra, not subject records):
  "report_configs",         // Group A — agency-configured report recipients (org config).
  "bank_statement_imports", // Group A — the agency's own imported statement account (trust/operating), not a subject.
  "platform_email_retries", // Group C — transient send-queue rows; ensure they purge post-send/failure (infra TTL).
])

// 4. RETENTION-PURGE tables (CD PII-disposition 2026-07-07) — TRANSIENT, TIME-expiring PII with NO data-subject FK, so it
//    cannot be keyed into the subject-DSAR erasure plan AND its lawful basis lapses by elapsed time (marketing consent/LI).
//    The operative POPIA control is a scheduled time purge (s14 — "not longer than necessary"), NOT a DSAR strip.
//    Classifying the bucket here clears the ratchet; the purge cron is the P-3 follow-up (tracked). CD validated this as a
//    legitimate 4th disposition for FK-less transient data — but ONLY that: event-expiring subjects go to MANUAL-REVIEW.
const RETENTION_PURGE_TABLES = new Set<string>([
  "contact_leads",    // marketing leads (email/phone, no subject FK) — weak lawful basis; time-purge, don't hold forever.
  "waitlist",         // waitlist signups (email only, no subject FK) — same class as contact_leads.
  // NB (CD 2026-07-07): this bucket is ONLY for genuinely transient, TIME-expiring FK-less data. Active-relationship
  // subjects (e.g. hoa_unit_owners) do NOT belong here — a purge clock would delete live records; they're MANUAL-REVIEW.
])

const manifest = JSON.parse(readFileSync(join(ROOT, "scripts", "schema-manifest.json"), "utf8")) as {
  tables: Record<string, string[]>
}

const uncovered: string[] = []
for (const [table, cols] of Object.entries(manifest.tables)) {
  if (table.endsWith("_view")) continue // views derive from base tables — erasure classifies the base columns
  if (ACCOUNTABILITY_TABLES.has(table) || MANUAL_REVIEW_TABLES.has(table)
      || NON_PII_TABLES.has(table) || RETENTION_PURGE_TABLES.has(table)) continue
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
