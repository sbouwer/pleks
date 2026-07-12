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
 *              c. else HOLD — the accrual engine finds no rate and accrues nothing. Derived live, never
 *                 stamped: the hold heals itself the moment a rate becomes reachable.
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
import { resolveDepositInterestConfig } from "@/lib/deposits/interestConfig"

/** How a lease's deposit interest rate was resolved — or why it could not be. */
export type DepositRateSource =
  | "import_file"          // the file carried the rate this deposit was actually taken at
  | "agency_config"        // a deposit_interest_config RESOLVES for this lease
  | "config_unreachable"   // configs EXIST, but none resolves for this lease (see below — the live bug)
  | "no_config"            // no rate anywhere

export interface DepositRateResolution {
  /** Written to `leases.deposit_interest_rate_percent`. Null when a config supplies the rate, or when none does. */
  ratePercent: number | null
  source: DepositRateSource
  /**
   * No rate reaches this lease ⇒ accrual is HELD.
   *
   * DERIVED, never stamped on the lease. An earlier draft persisted a `deposit_rate_status` column — which
   * would have held the lease forever, even after the agency fixed their config, because a stamp does not
   * re-evaluate. The accrual engine reaches the same conclusion the same way, live, every run: no config
   * resolves + no lease rate ⇒ nothing to accrue at ⇒ accrue nothing. The hold heals itself the moment a rate
   * becomes reachable. (ADDENDUM_70K Phase E: a column that cannot exist cannot be stamped wrong.)
   */
  held: boolean
}

/** Does ANY effective config row exist for this org? Used ONLY to tell "configs exist but none reaches this
 *  lease" apart from "no rate anywhere" — never to decide whether a rate applies. See resolveDepositRate. */
async function orgHasAnyConfig(db: SupabaseClient, orgId: string): Promise<boolean> {
  const today = saTodayISO()
  const { data, error } = await db
    .from("deposit_interest_config")
    .select("id")
    .eq("org_id", orgId)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .limit(1)
    .maybeSingle()

  logQueryError("orgHasAnyConfig deposit_interest_config", error)
  return !error && !!data
}

/**
 * Resolve the interest rate for a deposit the agency already holds.
 *
 * ⚠ REACHABILITY, NOT EXISTENCE. The question is NOT "does this org have a config row?" — it is "will the
 * accrual engine actually RESOLVE a rate for THIS lease?" Those differ, and the difference is a live bug we
 * found in prod: an agency's configs were scoped to a deposit-holding bank account (the RHA s5(3)(c)-correct
 * thing to do), while the leases had no account linked. `resolveDepositInterestConfig` walks
 * account → unit → property → org, so it matched NOTHING — and the accrual engine's fallback then invented 5%
 * and posted it, silently, for three weeks. An existence check would have answered "yes, they have a rate",
 * set status='set', skipped the hold, and reproduced the exact bug. So we call the ONE resolver the accrual
 * engine itself calls — never a second implementation of the question.
 *
 * Order: the file's rate → a config that RESOLVES for this lease → hold.
 */
export async function resolveDepositRate(
  db: SupabaseClient,
  orgId: string,
  lease: { propertyId: string | null; unitId: string | null; bankAccountId: string | null },
  filePercent: number | null,
): Promise<DepositRateResolution> {
  // (a) The file knows the rate this deposit was actually taken at. Nothing beats that.
  if (filePercent !== null) {
    return { ratePercent: filePercent, source: "import_file", held: false }
  }

  // (b) A config that ACTUALLY RESOLVES for this lease — the same call, with the same scope, that the accrual
  //     engine will make. If this resolves, accrual will too.
  const config = await resolveDepositInterestConfig(
    orgId, lease.propertyId, lease.unitId, saTodayISO(), lease.bankAccountId,
  )
  if (config) {
    return { ratePercent: null, source: "agency_config", held: false }
  }

  // (c) No rate reaches this lease. HOLD — never accrue at an invented one. But distinguish the two ways of
  //     getting here: "you have a rate, it just does not reach this lease" is a one-click fix; "no rate
  //     anywhere" is a different conversation. A hold that cannot tell you which is a support ticket.
  const configsExist = await orgHasAnyConfig(db, orgId)
  return {
    ratePercent: null,
    source: configsExist ? "config_unreachable" : "no_config",
    held: true,
  }
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
