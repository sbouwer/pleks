/**
 * test/db/tier.ts — reusable DB-integration fixtures for money/trust paths
 *
 * Auth:   service-role client against the LOCAL Supabase stack (see test/db/setup.ts)
 * Data:   seeds organisations → properties → units → contacts → tenants → leases → rent_invoices
 *         (+ optional arrears_case + arrears_interest_charges); tears the whole org down by FK order.
 * Notes:  First consumer is the recordPayment ledger characterization test; Step 4's
 *         disburse_deposit_atomic test and the sign-off tests reuse the SAME seed + teardown +
 *         ledgerInvariant so fixtures are defined once. Every insert asserts { error } (CLAUDE.md).
 */
import { randomUUID } from "node:crypto"
import { execSync } from "node:child_process"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { addCalendarDays, saDateISO } from "@/lib/dates"

let _container: string | null = null
function dbContainer(): string {
  if (_container) return _container
  // Local test tier: `docker` is a required dev tool. Fixed literal command, no user input.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const name = execSync('docker ps --filter name=supabase_db --format "{{.Names}}"', { encoding: "utf8" })
    .trim().split(/\r?\n/)[0]
  if (!name) throw new Error("teardown: no running `supabase_db` container — run `npx supabase start`")
  _container = name
  return name
}
function psql(sql: string): void {
  execSync(`docker exec -i ${dbContainer()} psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql, stdio: ["pipe", "pipe", "pipe"],
  })
}

export function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Seed a bare auth.users row and return its id — for the FK-required created_by/actor columns some tables carry
 *  (e.g. maintenance_cost_allocations.created_by → auth.users). Not org-scoped, so clean it up with teardownUser. */
export function seedUser(): string {
  const id = randomUUID()
  psql(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${id}@dbtest.local') ON CONFLICT DO NOTHING;`)
  return id
}
export function teardownUser(id: string): void {
  psql(`DELETE FROM auth.users WHERE id = '${id}';`)
}
// Fixed anchor so seeded dates are deterministic across a run (no Date.now flakiness in ordering).
const ANCHOR = new Date("2026-07-01T00:00:00Z").getTime()
function isoDate(offsetDays: number): string {
  return addCalendarDays(saDateISO(new Date(ANCHOR)), offsetDays)
}

async function ins<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.from(table).insert(row).select().single()
  if (error) throw new Error(`seed ${table}: ${error.message}`)
  return data as T
}

/**
 * Seed a BARE, EMPTY org — for pipelines that create their own properties/units/tenants/leases (the bulk
 * importer). Carries the same `ledger-test ` name prefix so cleanupStrayTestOrgs sweeps it if a run aborts.
 */
export async function seedEmptyOrg(db: SupabaseClient): Promise<string> {
  const orgId = randomUUID()
  await ins(db, "organisations", { id: orgId, name: `ledger-test ${orgId.slice(0, 8)}` })
  return orgId
}

export interface InvoiceSpec {
  /** stable label used to target the invoice in a test (e.g. "X", "W") */
  key: string
  totalCents: number
  /** already-paid on the invoice before the payment under test (default 0) */
  paidCents?: number
  /** due date relative to the fixed anchor; more-negative = older (allocated first) */
  dueOffsetDays: number
  /** explicit status; default derived from paid vs total */
  status?: "open" | "partial" | "overdue" | "paid"
}

export interface InterestSpec {
  interestCents: number
  /** charge date relative to the anchor; more-negative = older (consumed first) */
  chargeOffsetDays: number
}

export interface SeededCase {
  orgId: string
  propertyId: string
  unitId: string
  contactId: string
  tenantId: string
  leaseId: string
  arrearsCaseId: string | null
  /** by spec key → { id, balanceBefore } captured at seed time */
  invoices: Record<string, { id: string; totalCents: number; balanceBefore: number }>
  interestIds: string[]
}

/**
 * Seed one self-contained lease with the given invoices and (optional) interest charges.
 * Everything is scoped to a fresh org so tests never collide; call teardownOrg(db, orgId) after.
 */
export async function seedLedgerCase(
  db: SupabaseClient,
  spec: { invoices: InvoiceSpec[]; interest?: InterestSpec[]; rentCents?: number },
): Promise<SeededCase> {
  const orgId = randomUUID()
  const rentCents = spec.rentCents ?? 100_000

  await ins(db, "organisations", { id: orgId, name: `ledger-test ${orgId.slice(0, 8)}` })
  const property = await ins<{ id: string }>(db, "properties", {
    org_id: orgId, name: "Test Property", address_line1: "1 Test Rd", city: "Cape Town", province: "Western Cape",
  })
  const unit = await ins<{ id: string }>(db, "units", {
    org_id: orgId, property_id: property.id, unit_number: "1",
  })
  const contact = await ins<{ id: string }>(db, "contacts", { org_id: orgId })
  const tenant = await ins<{ id: string }>(db, "tenants", { org_id: orgId, contact_id: contact.id })
  const lease = await ins<{ id: string }>(db, "leases", {
    org_id: orgId, unit_id: unit.id, property_id: property.id, tenant_id: tenant.id,
    start_date: isoDate(-90), rent_amount_cents: rentCents,
  })

  const invoices: SeededCase["invoices"] = {}
  let seq = 0
  for (const s of spec.invoices) {
    const paid = s.paidCents ?? 0
    const balance = s.totalCents - paid
    let status = s.status
    if (!status) {
      if (balance <= 0) status = "paid"
      else if (paid > 0) status = "partial"
      else status = "open"
    }
    const due = isoDate(s.dueOffsetDays)
    const inv = await ins<{ id: string }>(db, "rent_invoices", {
      org_id: orgId, lease_id: lease.id, unit_id: unit.id, tenant_id: tenant.id,
      invoice_number: `INV-${orgId.slice(0, 8)}-${++seq}`,
      invoice_date: due, due_date: due, period_from: due, period_to: isoDate(s.dueOffsetDays + 30),
      rent_amount_cents: s.totalCents, total_amount_cents: s.totalCents,
      amount_paid_cents: paid, balance_cents: balance, status,
    })
    invoices[s.key] = { id: inv.id, totalCents: s.totalCents, balanceBefore: balance }
  }

  let arrearsCaseId: string | null = null
  const interestIds: string[] = []
  if (spec.interest?.length) {
    const ac = await ins<{ id: string }>(db, "arrears_cases", {
      org_id: orgId, lease_id: lease.id, tenant_id: tenant.id, unit_id: unit.id, property_id: property.id,
    })
    arrearsCaseId = ac.id
    for (const c of spec.interest) {
      const charge = await ins<{ id: string }>(db, "arrears_interest_charges", {
        org_id: orgId, arrears_case_id: ac.id, lease_id: lease.id, tenant_id: tenant.id,
        charge_date: isoDate(c.chargeOffsetDays),
        principal_cents: c.interestCents * 10, prime_rate_percent: 11, margin_percent: 2, effective_rate_percent: 13,
        interest_cents: c.interestCents, waived: false,
      })
      interestIds.push(charge.id)
    }
  }

  return {
    orgId, propertyId: property.id, unitId: unit.id, contactId: contact.id, tenantId: tenant.id,
    leaseId: lease.id, arrearsCaseId, invoices, interestIds,
  }
}

/**
 * The money invariant for a single payment: everything the payment settled — balance actually
 * removed from invoices + interest consumed — plus surplus recorded on the payment, must equal
 * the payment's face value. Over-application (the double-count) makes lhs > payment.
 */
export interface LedgerInvariant {
  balanceReductionCents: number
  interestWaivedCents: number
  surplusCents: number
  paymentAmountCents: number
  lhs: number // balanceReduction + interestWaived + surplus
  holds: boolean
}

export async function ledgerInvariant(
  db: SupabaseClient,
  seeded: SeededCase,
  paymentId: string,
): Promise<LedgerInvariant> {
  const { data: invs, error: invErr } = await db
    .from("rent_invoices").select("id, balance_cents").eq("lease_id", seeded.leaseId)
  if (invErr) throw new Error(`ledgerInvariant rent_invoices: ${invErr.message}`)
  const beforeById = new Map(Object.values(seeded.invoices).map((i) => [i.id, i.balanceBefore]))
  let balanceReductionCents = 0
  for (const inv of invs ?? []) {
    const before = beforeById.get(inv.id) ?? 0
    balanceReductionCents += before - (inv.balance_cents ?? 0)
  }

  let interestWaivedCents = 0
  if (seeded.interestIds.length) {
    const { data: charges, error: chErr } = await db
      .from("arrears_interest_charges").select("interest_cents, waived").in("id", seeded.interestIds)
    if (chErr) throw new Error(`ledgerInvariant arrears_interest_charges: ${chErr.message}`)
    interestWaivedCents = (charges ?? []).filter((c) => c.waived).reduce((s, c) => s + (c.interest_cents ?? 0), 0)
  }

  const { data: pay, error: payErr } = await db
    .from("payments").select("amount_cents, surplus_cents").eq("id", paymentId).single()
  if (payErr) throw new Error(`ledgerInvariant payments: ${payErr.message}`)
  const surplusCents = pay.surplus_cents ?? 0
  const paymentAmountCents = pay.amount_cents ?? 0
  const lhs = balanceReductionCents + interestWaivedCents + surplusCents

  return { balanceReductionCents, interestWaivedCents, surplusCents, paymentAmountCents, lhs, holds: lhs === paymentAmountCents }
}

/**
 * Delete everything seeded under an org. Runs with `session_replication_role = replica`, which turns
 * off FK enforcement + user triggers for this session — so we can delete from every org_id base table
 * in any order (trigger-created rows and deep FK chains included) and drop the org, in one round-trip.
 * `postgres` is permitted to set replica role on the local stack. Org-scoped: never touches other orgs.
 */
export function teardownOrg(orgId: string): void {
  // orgId is a server-minted uuid (randomUUID) — safe to inline as a literal.
  psql(`
SET session_replication_role = replica;
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'org_id' AND NOT a.attisdropped
      AND c.relname <> 'organisations'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE org_id = %L', t, '${orgId}');
  END LOOP;
END $$;
DELETE FROM public.organisations WHERE id = '${orgId}';
`)
}

/** Remove any orgs left behind by a crashed/aborted test run (best-effort, matched by seed name). */
export function cleanupStrayTestOrgs(): void {
  psql(`
SET session_replication_role = replica;
DO $$
DECLARE o uuid; t text;
BEGIN
  FOR o IN SELECT id FROM organisations WHERE name LIKE 'ledger-test %' LOOP
    FOR t IN
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'org_id' AND NOT a.attisdropped
        AND c.relname <> 'organisations'
    LOOP
      EXECUTE format('DELETE FROM public.%I WHERE org_id = %L', t, o);
    END LOOP;
    DELETE FROM organisations WHERE id = o;
  END LOOP;
END $$;
`)
}

// ── Deposit fixtures (Step 4 — disburse_deposit_atomic) ────────────────────────

export interface SeededDeposit extends SeededCase {
  reconId: string
  refundCents: number
  deductionsCents: number
}

/** Seed a lease + a deposit_reconciliations row (ready to disburse) + a running deposit_timer. */
export async function seedDepositCase(
  db: SupabaseClient,
  spec: { refundCents: number; deductionsCents?: number; depositHeldCents?: number },
): Promise<SeededDeposit> {
  const base = await seedLedgerCase(db, { invoices: [] })
  const refundCents = spec.refundCents
  const deductionsCents = spec.deductionsCents ?? 0
  const held = spec.depositHeldCents ?? refundCents + deductionsCents
  const recon = await ins<{ id: string }>(db, "deposit_reconciliations", {
    org_id: base.orgId, lease_id: base.leaseId, tenant_id: base.tenantId,
    deposit_held_cents: held, total_available_cents: held,
    refund_to_tenant_cents: refundCents, deductions_to_landlord_cents: deductionsCents,
    total_deductions_cents: deductionsCents,
  })
  await ins(db, "deposit_timers", {
    org_id: base.orgId, lease_id: base.leaseId, return_days: 14, deadline: isoDate(14), status: "running",
  })
  return { ...base, reconId: recon.id, refundCents, deductionsCents }
}

/**
 * Toggle a temporary BEFORE INSERT trigger on trust_transactions that always raises. Lets a test prove
 * a failing trust posting rolls the whole enclosing RPC transaction back (the disburse_deposit_atomic
 * hazard). The disburse trust postings pass statement_month=NULL, so the real closed-period trigger
 * can't force this — hence a dedicated failure injector. Always toggle off in a finally/afterEach.
 */
export function forceTrustInsertFailure(on: boolean): void {
  if (on) {
    psql(`CREATE OR REPLACE FUNCTION _test_fail_trust() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'test-forced-trust-failure' USING ERRCODE = 'check_violation'; END; $fn$;
DROP TRIGGER IF EXISTS _test_fail_trust_trg ON trust_transactions;
CREATE TRIGGER _test_fail_trust_trg BEFORE INSERT ON trust_transactions FOR EACH ROW EXECUTE FUNCTION _test_fail_trust();`)
  } else {
    psql(`DROP TRIGGER IF EXISTS _test_fail_trust_trg ON trust_transactions;
DROP FUNCTION IF EXISTS _test_fail_trust();`)
  }
}

/**
 * Toggle a temporary BEFORE INSERT trigger on deposit_transactions that always raises — the deposit-side
 * analogue of forceTrustInsertFailure. Lets a test force a failure at the deposit_transactions step of a
 * multi-write RPC (e.g. settle_deposit_charge_pattern_a_atomic, which posts no trust row — the money moves
 * deposit→invoice internally — so the trust injector can't reach it). Always toggle off in a finally/afterEach.
 */
export function forceDepositTxnInsertFailure(on: boolean): void {
  if (on) {
    psql(`CREATE OR REPLACE FUNCTION _test_fail_deptxn() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'test-forced-deposit-txn-failure' USING ERRCODE = 'check_violation'; END; $fn$;
DROP TRIGGER IF EXISTS _test_fail_deptxn_trg ON deposit_transactions;
CREATE TRIGGER _test_fail_deptxn_trg BEFORE INSERT ON deposit_transactions FOR EACH ROW EXECUTE FUNCTION _test_fail_deptxn();`)
  } else {
    psql(`DROP TRIGGER IF EXISTS _test_fail_deptxn_trg ON deposit_transactions;
DROP FUNCTION IF EXISTS _test_fail_deptxn();`)
  }
}
