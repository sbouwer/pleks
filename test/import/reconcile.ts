/**
 * test/import/reconcile.ts — the outcome contract, and the global invariants that hold under ANY input
 *
 * Notes:  THE FOUR CLASSES. Every row, benign or corrupted, must land in exactly one:
 *
 *           imported      the value survived the round trip and EQUALS ground truth
 *           flagged       ambiguity the importer refused to guess at, and SAID so (the flag-not-guess doctrine,
 *                         made testable — a doctrine you cannot assert is a slogan)
 *           rejected-row  the row did not import, by name, and the rest of the book did
 *           rejected-file the file did not import at all
 *
 *         THE FORBIDDEN FIFTH:
 *
 *           silently-wrong   a database value that differs from ground truth, with NO flag naming it.
 *
 *         That is the harness's only real failure condition, and every instance it finds comes with a seed, a
 *         dialect and a field — i.e. a replayable fixture, not a hunch. Everything else in this file exists to
 *         make that one class detectable.
 *
 *         THE GLOBAL INVARIANTS hold on every run regardless of scenario, which is where a stress harness
 *         earns its keep: they are true under inputs nobody sat down and designed.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ImportResult, ImportError } from "@/lib/import/importRunner"
import type { GroundTruth, GtRow } from "./book"

export interface Finding {
  row: number
  field: string
  expected: unknown
  actual: unknown
  /** The whole point of the harness: was the agency TOLD, or did this land in silence? */
  silent: boolean
}

/** Was any message raised naming this row, or this field on this row? */
function toldAbout(errors: ImportError[], rowIndex: number, field: string): boolean {
  return errors.some(
    (e) => (e.rowIndex === rowIndex && (e.field === field || e.field === "")) ||
           (e.rowIndex === -1 && e.field === field),
  )
}

/** A lease as it landed, joined back to the truth row that produced it. */
interface LandedLease {
  rent_amount_cents: number
  deposit_amount_cents: number | null
  lease_type: string
  escalation_type: string
  escalation_percent: number | null
  payment_due_day: string | number | null
  notice_period_days: number | null
  deposit_return_days: number | null
  is_fixed_term: boolean
  cpa_applies: boolean
  payment_reference: string | null
  start_date: string
  end_date: string | null
  status: string
  units: { unit_number: string } | { unit_number: string }[] | null
}

const unitNumberOf = (l: LandedLease): string | undefined =>
  Array.isArray(l.units) ? l.units[0]?.unit_number : l.units?.unit_number

/**
 * Compare the DATABASE against the ORACLE, lease by lease, field by field.
 *
 * Joined on unit_number — the one key that survives the round trip without being re-derived by the code under
 * test. (Joining on an id the importer minted would be circular: it would only ever prove the importer agrees
 * with itself.)
 */
export async function reconcileLeases(
  db: SupabaseClient, orgId: string, truth: GroundTruth, result: ImportResult,
): Promise<Finding[]> {
  const { data, error } = await db
    .from("leases")
    .select("rent_amount_cents, deposit_amount_cents, lease_type, escalation_type, escalation_percent, " +
      "payment_due_day, notice_period_days, deposit_return_days, is_fixed_term, cpa_applies, " +
      "payment_reference, start_date, end_date, status, units!inner(unit_number)")
    .eq("org_id", orgId)
  if (error) throw new Error(`reconcile read-back: ${error.message}`)

  const landed = new Map<string, LandedLease>()
  for (const l of (data ?? []) as unknown as LandedLease[]) {
    const u = unitNumberOf(l)
    if (u) landed.set(u, l)
  }

  const findings: Finding[] = []
  const errors = result.errors as ImportError[]

  for (const t of truth.rows.filter((r) => r.entity === "tenant")) {
    const lease = landed.get(t.unitNumber ?? "")

    if (!lease) {
      // Absent. That is legitimate ONLY if the importer said the row did not make it.
      if (!toldAbout(errors, t.index, "") && !errors.some((e) => e.rowIndex === t.index)) {
        findings.push({ row: t.index, field: "(lease)", expected: "imported", actual: "missing", silent: true })
      }
      continue
    }

    const check = (field: string, expected: unknown, actual: unknown) => {
      if (String(expected) === String(actual)) return
      findings.push({ row: t.index, field, expected, actual, silent: !toldAbout(errors, t.index, field) })
    }

    check("rent_amount_cents", t.rentCents, lease.rent_amount_cents)
    check("deposit_amount_cents", t.depositCents, lease.deposit_amount_cents)
    check("lease_type", t.leaseType, lease.lease_type)
    // "No escalation" is stored as fixed @ 0% — the column has no "none". The ORACLE asserts the translation,
    // which is the point: it pins that a lease saying "no increase" holds a ZERO, not the 10.00 schema default.
    check("escalation_type", t.escalationType === "none" ? "fixed" : t.escalationType, lease.escalation_type)
    check("escalation_percent", t.escalationPercent, Number(lease.escalation_percent))
    check("payment_due_day", t.paymentDueDay, Number(lease.payment_due_day))
    check("notice_period_days", t.noticePeriodDays, lease.notice_period_days)
    check("deposit_return_days", t.depositReturnDays, lease.deposit_return_days)
    check("is_fixed_term", t.isFixedTerm, lease.is_fixed_term)
    check("cpa_applies", t.cpaApplies, lease.cpa_applies)
    check("payment_reference", t.paymentReference, lease.payment_reference)
    check("start_date", t.leaseStart, lease.start_date)
    check("end_date", t.leaseEnd ?? null, lease.end_date)
  }

  return findings
}

// ── GLOBAL INVARIANTS ────────────────────────────────────────────────────────────────────────────

export interface InvariantBreach {
  invariant: string
  detail: string
}

/**
 * Every one of these must hold on EVERY run — clean book, poisoned book, 1 row or 5 000. They are the
 * assertions that do not need to know what scenario is being run, which is precisely why they catch what
 * the scenario author did not think of.
 */
export async function checkInvariants(
  db: SupabaseClient, orgId: string, truth: GroundTruth, result: ImportResult,
): Promise<InvariantBreach[]> {
  const breaches: InvariantBreach[] = []
  const errors = result.errors as ImportError[]

  // 1. MONEY CONSERVATION. The sum of imported rent must equal the ground-truth sum of the rows that were
  //    accepted. Any ×100 anywhere — a locale comma, a cents-named column, a rands column read as cents —
  //    shows up here instantly, without anyone having to guess which field it hid in.
  const { data: leases, error: leaseErr } = await db
    .from("leases").select("rent_amount_cents, deposit_amount_cents, units!inner(unit_number)").eq("org_id", orgId)
  if (leaseErr) throw new Error(`invariant read-back: ${leaseErr.message}`)

  const landedUnits = new Set(
    ((leases ?? []) as unknown as LandedLease[]).map(unitNumberOf).filter((u): u is string => !!u),
  )
  const acceptedTruth = truth.rows.filter((r) => r.entity === "tenant" && landedUnits.has(r.unitNumber ?? ""))

  const expectRent = acceptedTruth.reduce((s, r) => s + (r.rentCents ?? 0), 0)
  const actualRent = (leases ?? []).reduce((s, l) => s + (l.rent_amount_cents as number), 0)
  if (expectRent !== actualRent) {
    breaches.push({
      invariant: "money conservation",
      detail: `rent: expected ${expectRent} cents across ${acceptedTruth.length} accepted leases, ` +
        `database holds ${actualRent} (× ${(actualRent / (expectRent || 1)).toFixed(2)})`,
    })
  }

  const expectDep = acceptedTruth.reduce((s, r) => s + (r.depositCents ?? 0), 0)
  const actualDep = (leases ?? []).reduce((s, l) => s + ((l.deposit_amount_cents as number) ?? 0), 0)
  if (expectDep !== actualDep) {
    breaches.push({
      invariant: "money conservation",
      detail: `deposit: expected ${expectDep} cents, database holds ${actualDep}`,
    })
  }

  // 2. REPORT HONESTY. Nothing vanishes. Every row in the file was imported, or flagged, or skipped — and
  //    the report says which. This is the F-1 lesson codified: a row that is silently dropped is the single
  //    worst thing an importer can do, because the agency has no way to even know to look for it.
  const rowsInFile = truth.rows.length

  // A row is ACCOUNTED FOR if it was created, or skipped, or REFUSED BY NAME. The third is the one an earlier
  // version of this invariant forgot, and it made the harness accuse the importer of losing rows it had in fact
  // reported correctly — a false positive is a bug in the detector, and a noisy detector gets ignored.
  const refused = new Set(errors.filter((e) => e.severity === "error" && e.rowIndex >= 0).map((e) => e.rowIndex))
  const created = result.leasesCreated + result.landlordsImported +
    result.contractorsCreated + result.agentInvitesSent
  const accountedFor = created + result.skipped + refused.size

  if (accountedFor < rowsInFile) {
    // Which rows carry NO message of any kind? Those are the truly silent ones — the file had them, the
    // database does not, and nothing anywhere says why.
    const mentioned = new Set(errors.filter((e) => e.rowIndex >= 0).map((e) => e.rowIndex))
    const silentRows = truth.rows.filter((r) => !mentioned.has(r.index)).map((r) => r.index)
    breaches.push({
      invariant: "report honesty",
      detail: `${rowsInFile} rows in the file; created ${created} + skipped ${result.skipped} + refused ` +
        `${refused.size} = ${accountedFor}. ${rowsInFile - accountedFor} row(s) are accounted for by NONE of ` +
        `the three${silentRows.length ? `; rows [${silentRows.slice(0, 8).join(", ")}] carry no message at all` : ""}. ` +
        `A row that vanishes with no trace is the one failure an agency cannot detect for themselves.`,
    })
  }

  // 3. NO INVENTED RATES. A deposit whose interest rate nobody stated must accrue NOTHING. The `?? 5` that
  //    invented a 5% rate on other people's trust money is the founding member of this bug class; the
  //    invariant makes its return impossible to miss.
  const { data: accruals, error: accErr } = await db
    .from("deposit_transactions").select("id, amount_cents")
    .eq("org_id", orgId).eq("transaction_type", "interest_accrued")
  if (accErr) throw new Error(`invariant read-back (accruals): ${accErr.message}`)
  if ((accruals ?? []).length > 0) {
    breaches.push({
      invariant: "no invented rates",
      detail: `${accruals!.length} deposit-interest accrual(s) exist immediately after an import. An import ` +
        `states an opening balance; it never states that interest has been EARNED. Someone invented a rate.`,
    })
  }

  // 4. ENCRYPTION AT REST. No plaintext SA ID may exist in any column of any table this run touched. The
  //    write helper bundles ciphertext + hash — so a plaintext 13-digit ID here means a write path bypassed it.
  const plaintextIds = truth.rows.map((r) => r.idNumber).filter((x): x is string => !!x)
  if (plaintextIds.length) {
    const { data: contacts, error: cErr } = await db
      .from("contacts").select("id, id_number").eq("org_id", orgId)
    if (cErr) throw new Error(`invariant read-back (contacts): ${cErr.message}`)
    const leaked = (contacts ?? []).filter((c) => plaintextIds.includes(String(c.id_number ?? "")))
    if (leaked.length) {
      breaches.push({
        invariant: "encryption at rest",
        detail: `${leaked.length} contact(s) carry a RAW SA ID in contacts.id_number. Every write must go ` +
          `through idNumberColumns() — ciphertext plus a hash, never the number itself.`,
      })
    }
  }

  // 5. TRUST DISCIPLINE. Trust postings exist for attested deposit rows and for nothing else. Money that
  //    lands in the trust ledger without an attestation is money we claimed to hold on a say-so we never got.
  const { data: trust, error: tErr } = await db
    .from("trust_transactions").select("id, amount_cents").eq("org_id", orgId)
  if (tErr) throw new Error(`invariant read-back (trust): ${tErr.message}`)
  const trustCents = (trust ?? []).reduce((s, t) => s + Math.abs(t.amount_cents as number), 0)
  if (trustCents > 0 && result.depositsMigratedCents === 0) {
    breaches.push({
      invariant: "trust discipline",
      detail: `${trustCents} cents sit in the trust ledger but the import reports 0 deposits migrated — ` +
        `trust money appeared that the import does not admit to having put there.`,
    })
  }

  return breaches
}

/**
 * A content hash of everything the import wrote, for the IDEMPOTENCY invariant: run the same book twice and
 * the database must be byte-identical the second time. Deliberately excludes ids and timestamps — they are
 * expected to differ; what must not differ is the SUBSTANCE.
 */
export async function contentHash(db: SupabaseClient, orgId: string): Promise<string> {
  // Every query checks its own error. A hash built from a SILENTLY-FAILED query is the worst possible
  // verifier: two failed runs both hash to nothing, so `contentHash(a) === contentHash(b)` and the
  // idempotency test PASSES having compared two empty sets. A check that cannot fail is not a check.
  const table = async (name: string, cols: string) => {
    const { data, error } = await db.from(name).select(cols).eq("org_id", orgId)
    if (error) throw new Error(`contentHash(${name}): ${error.message}`)
    return (data ?? []).map((r) => JSON.stringify(r)).sort().join("|")
  }

  return [
    await table("properties", "name, address_line1, city, province, type"),
    await table("units", "unit_number, status"),
    await table("leases", "rent_amount_cents, deposit_amount_cents, start_date, end_date, lease_type, status"),
    await table("contacts", "primary_email, primary_role, entity_type"),
    await table("trust_transactions", "amount_cents, transaction_type"),
  ].join("\n##\n")
}

/** Which truth rows the reconciler expects to find, given what the corruption engine did to them. */
export function expectedImported(truth: GroundTruth): GtRow[] {
  return truth.rows.filter((r) => r.entity === "tenant")
}
