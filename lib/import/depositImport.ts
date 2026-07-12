/**
 * lib/import/depositImport.ts — migrating a deposit the agency ALREADY HOLDS
 *
 * Notes:  Two separate problems, and they must not be confused.
 *
 *         1. THE RATE. RHA s5(3) interest cannot accrue without one, and the rate for a deposit taken years
 *            ago by another system is not something Pleks can infer. `accrueDepositInterest` today falls back
 *            to a HARD-CODED 5% p.a. when it finds neither a deposit_interest_config nor a per-lease rate —
 *            i.e. it invents a rate and applies it to money held in trust for someone else. An under-accrual
 *            short-changes the tenant; an over-accrual short-changes the landlord; neither is discoverable
 *            from the ledger afterwards.
 *            Ruling (Stéan, 2026-07-12) — resolve in this order, and HOLD rather than guess:
 *              a. the rate in the import file, if it carries one
 *              b. else the agency's OWN configured rate (a deposit_interest_config row — a deliberate object
 *                 someone created, NOT `organisations.deposit_interest_rate_percent`, which carries a schema
 *                 DEFAULT of 5.00 and therefore cannot distinguish "the agency chose 5%" from "nobody chose")
 *              c. else `deposit_rate_status = 'imported_not_set'` → accrual is HELD until an agent sets it.
 *
 *         2. THE LEDGER. The money is real and the agency is holding it, so it belongs in the deposit/trust
 *            sub-ledger as an OPENING BALANCE — otherwise a move-out reconciliation has no principal and the
 *            trust ledger under-states what the agency actually holds. `record_deposit_atomic` carries
 *            `p_is_opening_balance` for exactly this. But posting into a trust ledger asserts a bank reality
 *            Pleks cannot see, so it is gated on the agent's explicit confirmation that the agency holds these
 *            deposits. Not confirmed ⇒ the amount is recorded on the lease and NOTHING is posted (fail-closed),
 *            with the lease flagged. A trust ledger that silently disagrees with the bank is worse than an
 *            empty one.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { saTodayISO } from "@/lib/dates"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** How a migrated lease's deposit interest rate was resolved. */
export type DepositRateSource = "import_file" | "agency_config" | "not_set"

export interface DepositRateResolution {
  /** Written to `leases.deposit_interest_rate_percent`. Null when the config supplies it, or when unknown. */
  ratePercent: number | null
  /** Written to `leases.deposit_rate_status`. 'imported_not_set' HOLDS accrual — see depositInterest.ts. */
  status: "set" | "imported_not_set"
  source: DepositRateSource
}

/**
 * Does this org have a deposit-interest rate it actually CHOSE?
 *
 * Deliberately reads `deposit_interest_config` — a row someone created, effective-dated, with a `created_by` —
 * and NOT `organisations.deposit_interest_rate_percent`, which has a schema DEFAULT of 5.00. A default is not
 * a decision: reading it would mean every agency "has a configured rate" of 5% and the hold below could never
 * fire, which is the whole failure this exists to prevent.
 *
 * Only the ORG-level config is consulted. A property/unit-level config still resolves normally at accrual time
 * (the hierarchy lives in depositInterest.ts) — the question here is narrower: does a rate exist AT ALL for
 * this org, such that accrual will find one rather than fall through to the invented 5%?
 */
async function agencyHasConfiguredRate(db: SupabaseClient, orgId: string): Promise<boolean> {
  const today = saTodayISO()
  const { data, error } = await db
    .from("deposit_interest_config")
    .select("id")
    .eq("org_id", orgId)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .limit(1)
    .maybeSingle()

  logQueryError("agencyHasConfiguredRate deposit_interest_config", error)
  // Fail CLOSED: an errored lookup must not be read as "yes, they have a rate" — that would resume the guess.
  return !error && !!data
}

/**
 * Resolve the interest rate for a deposit the agency already holds, per the ruling. `filePercent` is the rate
 * the import file carried, if it carried one (already parsed; null when absent or unreadable).
 */
export async function resolveDepositRate(
  db: SupabaseClient,
  orgId: string,
  filePercent: number | null,
): Promise<DepositRateResolution> {
  // (a) The file knows the rate this deposit was actually taken at. Nothing beats that.
  if (filePercent !== null) {
    return { ratePercent: filePercent, status: "set", source: "import_file" }
  }

  // (b) The agency has configured a rate — accrual will resolve it through the config hierarchy, so the lease
  //     needs no rate of its own.
  if (await agencyHasConfiguredRate(db, orgId)) {
    return { ratePercent: null, status: "set", source: "agency_config" }
  }

  // (c) Nobody has chosen a rate. HOLD — never accrue at an invented one.
  return { ratePercent: null, status: "imported_not_set", source: "not_set" }
}

/**
 * Post the deposit the agency already holds into the deposit + trust sub-ledgers as an OPENING BALANCE.
 * Atomic (both ledgers commit together or neither) via the same RPC the normal activation path uses.
 *
 * Idempotent: a re-import must not double-post real money. `deposit_transactions` is checked for this lease
 * first — the whole importer is re-runnable by design (it is the documented remedy for a rejected row), so a
 * non-idempotent trust posting would duplicate an agency's entire deposit book on the second run.
 */
export async function postOpeningDeposit(
  db: SupabaseClient,
  args: {
    orgId: string
    leaseId: string
    tenantId: string
    propertyId: string
    unitId: string
    amountCents: number
    actorId: string | null
  },
): Promise<{ posted: boolean; error?: string }> {
  const { orgId, leaseId, tenantId, propertyId, unitId, amountCents, actorId } = args
  if (amountCents <= 0) return { posted: false }

  const { data: existing, error: existingError } = await db
    .from("deposit_transactions")
    .select("id")
    .eq("org_id", orgId)
    .eq("lease_id", leaseId)
    .limit(1)
    .maybeSingle()
  if (existingError) return { posted: false, error: existingError.message }
  if (existing) return { posted: false }   // already migrated — a re-run is a no-op, not a second deposit

  const { error } = await db.rpc("record_deposit_atomic", {
    p_org_id: orgId,
    p_lease_id: leaseId,
    p_tenant_id: tenantId,
    p_amount_cents: amountCents,
    p_dep_txn_type: "deposit_received",
    p_dep_description: "Opening balance — deposit migrated from the agency's previous system",
    p_trust_txn_type: "deposit_received",
    p_trust_description: "Opening balance — deposit held on migration",
    p_initiated_by: "agent",
    p_created_by: actorId,
    p_property_id: propertyId,
    p_unit_id: unitId,
    p_reference: `MIGRATION-${saTodayISO()}`,
    p_effective_rate_percent: null,
    p_rate_config_id: null,
    p_statement_month: null,
    // Marks the posting as a carried-over balance rather than money that moved through Pleks today — so it is
    // never read as a deposit RECEIVED on the import date, and bank reconciliation does not look for it.
    p_is_opening_balance: true,
    p_trust_reference: `MIGRATION-${saTodayISO()}`,
  })
  if (error) return { posted: false, error: error.message }

  return { posted: true }
}
