/**
 * test/db/import-ablation.dbtest.ts — FIELD ABLATION: remove one column at a time, and see what lies
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Every serious import bug this arc has the same shape — the code is internally consistent and WRONG
 *         ABOUT SOMETHING OUTSIDE ITSELF, and the wrongness is disguised as success:
 *           `?? 5`                  invented a deposit interest rate on trust money
 *           DEFAULT 'residential'   invented a lease type for a Retail lease
 *           `?? "unknown"`          collapsed money owed to owners into one unnamed bucket
 *           `|| null` into NOT NULL  turned a rejected insert into "Failed to create X"
 *           RETURN NEW on a DELETE  turned a swallowed delete into a reported success
 *
 *         They share ONE tell: a FALLBACK THAT TURNS "I DON'T KNOW" INTO A CONFIDENT VALUE. So instead of
 *         hunting each one by hand, provoke it: take a book that imports perfectly, remove ONE field, and look
 *         at what the database says afterwards.
 *
 *         THE INVARIANT (this is the whole test):
 *
 *             Removing a field may leave a column NULL — that is honest absence.
 *             Removing a field may REFUSE the row — that is an honest refusal.
 *             Removing a field may NOT quietly give a column a DIFFERENT NON-NULL VALUE,
 *             unless the agent is TOLD.
 *
 *         A column that changes to a confident wrong value with no message is the bug class, by definition.
 *         Anything this test prints as SILENT is either a real defect or a default that must be justified in
 *         EXPECTED_SILENT below — and every entry there is a decision someone had to make out loud.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportError } from "@/lib/import/importRunner"
import { saTodayISO, addCalendarMonths } from "@/lib/dates"

const db = svc()

function dmy(months: number): string {
  const [y, m, d] = addCalendarMonths(saTodayISO(), months).split("-")
  return `${d}/${m}/${y}`
}

/** ONE lease, with every column the importer supports populated. The control. */
const BOOK: Record<string, string> = {
  "Property Name": "Ablation Court",
  "Address": "1 Ablation Rd",
  "Suburb": "Rondebosch",
  "City": "Cape Town",
  "Province": "WC",
  "Unit Number": "1",
  "Owner Name": "Pieter van der Merwe",
  "Owner Email": "pieter@owners.co.za",
  "Owner Phone": "0821110000",
  "First Name": "Thabo",
  "Surname": "Nkosi",
  "Email": "thabo@example.co.za",
  "Cell": "0821234567",
  "ID Number": "9202204720082",
  "Lease Start": dmy(-8),
  "Lease End": dmy(+4),
  "Monthly Rent": "6 600,50",
  "Deposit": "13 201,00",
  // ⚠ EVERY value below is chosen to DIFFER from the column's DB default. If the control happened to equal
  // the default, removing the field would change nothing and the test would be BLIND to exactly the bug it
  // exists to find. (First draft used notice=20 / due-day=1 / interest-to=tenant — all three are the defaults,
  // so three real fall-throughs were invisible.)
  "Lease Type": "Commercial",          // default 'residential'
  "Escalation Type": "CPI",            // default 'fixed'
  "Escalation %": "7,5",               // default 10.00
  "CPA Applies": "Y",
  "Fixed Term": "N",                   // default true
  "Payment Due Day": "5",              // default '1'
  "Notice Period Days": "30",          // default 20
  "Payment Reference": "THABO-001",
  "Deposit Interest To": "landlord",   // default 'tenant'
  "Deposit Return Days": "14",         // default 30
  "Bank Account": "6241234567",
  "Bank Name": "FNB",
}

const HEADERS = Object.keys(BOOK)

/** Columns whose value we compare across ablations — the ones that carry meaning. */
const LEASE_COLS =
  "rent_amount_cents, deposit_amount_cents, lease_type, escalation_type, escalation_percent, cpa_applies, " +
  "cpa_applies_at_signing, is_fixed_term, payment_due_day, notice_period_days, payment_reference, " +
  "deposit_interest_to, deposit_return_days, start_date, end_date, status, landlord_id, incomplete_mandatory"

type Row = Record<string, unknown>

/** Was the agent TOLD about this column change? Via an import message on the column/field, OR — 21E F3 — the
 *  lease was held status='draft' with a non-empty incomplete_mandatory (on the burn-down, cannot activate). */
function columnChangeTold(lease: Row, col: string, now: unknown, dropped: string, messages: string): boolean {
  if (messages.includes(col) || messages.includes(dropped.toLowerCase())) return true
  // 21E F3: the incomplete_mandatory column IS the "the agent was told" signal — its change to name the missing
  // field is honest by definition; and a lease held status='draft' with a non-empty flag is likewise not silent.
  if (col === "incomplete_mandatory") return true
  const incompleteFlag = Array.isArray(lease.incomplete_mandatory) && (lease.incomplete_mandatory as string[]).length > 0
  return col === "status" && now === "draft" && incompleteFlag
}

async function importWith(orgId: string, agentId: string, book: Record<string, string>, headers: string[]) {
  const suggestions = matchColumns(headers)
  const wire: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }

  const decisions = toImportDecisions({
    columnMapping: wire,
    expiredLeaseAction: "skip",
    bankConsentAttested: true,
    depositsHeldAttested: true,
  })
  const row: Record<string, string> = {}
  for (const h of headers) row[h] = book[h] ?? ""

  const result = await runImport([row], toColumnMapping(wire), decisions, orgId, agentId, undefined, db)

  const { data: lease, error } = await db.from("leases").select(LEASE_COLS).eq("org_id", orgId).maybeSingle()
  if (error) throw new Error(`ablation read-back: ${error.message}`)
  return { result, lease: (lease ?? null) as Row | null }
}

/**
 * Defaults we have CONSCIOUSLY accepted: removing the field changes a column to a non-null value, and that is
 * allowed ONLY because the agent is warned about it at import level (a "no X column mapped" message).
 * Everything else that changes silently is a finding.
 */
const EXPECTED_SILENT: Record<string, string> = {}

describe("ABLATION — remove one field at a time and catch the defaults that lie", () => {
  let agentId: string
  let baseline: Row
  const orgs: string[] = []
  const findings: Array<{ field: string; column: string; was: unknown; now: unknown; flagged: boolean }> = []

  beforeAll(async () => {
    agentId = seedUser()
    const org = await seedEmptyOrg(db)
    orgs.push(org)
    const { result, lease } = await importWith(org, agentId, BOOK, HEADERS)
    expect(result.leasesCreated, "the control book must import cleanly").toBe(1)
    baseline = lease!
  }, 60_000)

  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("no removed field may silently change a column to a different non-null value", async () => {
    for (const dropped of HEADERS) {
      const org = await seedEmptyOrg(db)
      orgs.push(org)

      const headers = HEADERS.filter((h) => h !== dropped)
      const { result, lease } = await importWith(org, agentId, BOOK, headers)

      // Refused outright? That is an honest refusal — the row did not import and the agent was told.
      if (!lease) {
        const refused = result.errors.some((e: ImportError) => e.severity === "error")
        expect(refused, `dropping "${dropped}" created no lease and said nothing`).toBe(true)
        continue
      }

      const messages = result.errors.map((e: ImportError) => `${e.field} ${e.message}`).join(" | ").toLowerCase()

      for (const col of Object.keys(baseline)) {
        if (col.endsWith("_id")) continue             // per-org identities, not semantics
        const was = baseline[col]
        const now = lease[col]
        if (String(was) === String(now)) continue     // unchanged
        if (now === null) continue                    // honest absence — the column is simply empty

        // The column took a DIFFERENT, CONFIDENT value because the field went missing. That is a default
        // speaking on the agency's behalf. It is only acceptable if the agent was TOLD.
        findings.push({ field: dropped, column: col, was, now, flagged: columnChangeTold(lease, col, now, dropped, messages) })
      }
    }

    const silent = findings.filter((f) => !f.flagged && !EXPECTED_SILENT[f.column])

    // Always print the table — this is the audit, not just a pass/fail.
    const fmt = (f: typeof findings[number]) =>
      `  ${f.flagged ? "TOLD  " : "SILENT"}  drop "${f.field}" → ${f.column}: ${JSON.stringify(f.was)} ⇒ ${JSON.stringify(f.now)}`
    console.log(
      `\n── ablation: ${HEADERS.length} fields removed one at a time ──\n` +
      (findings.length ? findings.map(fmt).join("\n") : "  (no column changed value)") +
      `\n\n  ${silent.length} SILENT default(s) — a column that lied without telling the agent\n`,
    )

    expect(
      silent.map((f) => `drop "${f.field}" silently set ${f.column} = ${JSON.stringify(f.now)} (was ${JSON.stringify(f.was)})`),
      "a missing field must never hand a column a confident wrong value in silence",
    ).toEqual([])
  }, 300_000)
})
