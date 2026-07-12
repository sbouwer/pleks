/**
 * scripts/check-import-fields.mjs — the import wizard's three sets must agree
 *
 * The import feature has THREE independent lists of field names, and nothing has ever forced them to agree:
 *
 *   1. FIELD_ALIASES        (lib/import/columnMapper.ts)  — what an agency's HEADER can auto-map to
 *   2. ALL_FIELDS           (Step2Mapping.tsx)            — what the AGENT can pick from the dropdown
 *   3. getField(row, "x")   (lib/import/importRunner.ts)  — what the RUNNER actually reads
 *
 * Every drift between them is silent, and every one costs an agency data:
 *
 *   - "payment_method" was offered and mapped, and `leases` has no such column — so PostgREST rejected EVERY
 *     lease insert with "could not find the 'payment_method' column in the schema cache".
 *   - "address_line1" was offered in the dropdown while the runner reads "address" — so an agent who MANUALLY
 *     picked "Address" (the only option when their header did not auto-match) produced a mapping nothing read.
 *     Address is REQUIRED, so the property was refused, and with it every unit and lease under it.
 *   - "work_phone" and "trust_number" were offered and mapped with no column behind them at all — the agency's
 *     data was accepted, mapped, and silently dropped.
 *
 * None of these is visible to TypeScript: they are strings crossing three files. So they are checked here.
 * A field the agent can choose, or a header can map to, that the runner never reads, is a lie to the agent.
 *
 * Run: node scripts/check-import-fields.mjs   (wired into `npm run check`)
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(resolve(ROOT, p), "utf8")

/** Strip comments so a field name merely DISCUSSED in prose is not counted as used. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const mapper = read("lib/import/columnMapper.ts")
const wizard = read("app/(dashboard)/settings/import/_components/Step2Mapping.tsx")
const runner = stripComments(read("lib/import/importRunner.ts"))

const uniq = (a) => [...new Set(a)].sort()

/** 1. Field names any header alias can produce. */
const mappable = uniq([...mapper.matchAll(/field:\s*"([^"]+)"/g)].map((m) => m[1]))

/** 2. Field names the agent can pick in Step 2. */
const offered = uniq(
  [...wizard.matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== "__skip"),
)

/**
 * 3. Field names the runner references. Deliberately GENEROUS — any occurrence as a quoted literal in code
 * counts, because the runner reaches fields several ways (getField, getFieldSource, the CLASSIFIED_LEASE_COLUMNS
 * table, the bank-accounts loop). Being generous means a name this check flags is genuinely unreferenced.
 */
const isRead = (field) => new RegExp(`"${field.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}"`).test(runner)

/** Client-side-only fields: consumed by the wizard itself, never by the runner. Legitimately not read. */
const CLIENT_ONLY = new Set([
  "__entity_state",   // page.tsx filters inactive rows before POSTing
  "tenant_notes",     // routed to the import report by getExtraColumns, not to a column
  "unit_notes",
  "lease_notes",
  "export_csv",
  "__address_type",   // TPN metadata, explicitly labelled "(skip)" in the wizard
  "__description",
  "__entity_id",
  "__tpn_reference",
  "__address_2",
  "__address_3",
])

const deadMapped = mappable.filter((f) => !CLIENT_ONLY.has(f) && !isRead(f))
const deadOffered = offered.filter((f) => !CLIENT_ONLY.has(f) && !isRead(f))
const unofferedButMappable = mappable.filter((f) => !f.startsWith("__") && !CLIENT_ONLY.has(f) && !offered.includes(f))

let failed = false
const line = "─".repeat(78)
console.log(`\n🔎  Import field coverage (aliases ${mappable.length} · wizard ${offered.length})`)
console.log(line)

if (deadOffered.length) {
  failed = true
  console.error(`  ✗ ${deadOffered.length} field(s) the AGENT CAN PICK are never read by the runner.`)
  console.error(`    The agent maps their column to it and the data is silently dropped:`)
  for (const f of deadOffered) console.error(`      • ${f}`)
}

if (deadMapped.length) {
  failed = true
  console.error(`  ✗ ${deadMapped.length} field(s) a HEADER CAN AUTO-MAP to are never read by the runner:`)
  for (const f of deadMapped) console.error(`      • ${f}`)
}

if (unofferedButMappable.length) {
  // Not fatal: a field can be auto-suggested without being hand-pickable. But it means an agent whose header
  // did NOT auto-match cannot select it — which is precisely how the address bug bit.
  console.warn(`  ⚠ ${unofferedButMappable.length} field(s) auto-map but are NOT in the wizard dropdown`)
  console.warn(`    (an agent whose header did not auto-match cannot select them): ${unofferedButMappable.join(", ")}`)
}

if (!failed) console.log("  ✓ every mappable/selectable import field is actually read by the runner")
console.log(line)

process.exit(failed ? 1 : 0)
