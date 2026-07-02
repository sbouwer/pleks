/**
 * lib/finance/arrearsInterest.ts — accrue + waive arrears interest (simple interest, prime + margin)
 *
 * Auth:   Service-role client; callers gate. accrueArrearsInterest is cron-only (daily).
 *         waiveArrearsInterest is admin-gated at the route AND org-scoped here — the caseId must
 *         belong to the passed orgId. The service client bypasses RLS, so the explicit org_id
 *         filters ARE the tenancy boundary.
 * Data:   arrears_cases, arrears_interest_charges, get_prime_rate_on RPC. Charges are IMMUTABLE —
 *         waive marks them waived, never deletes.
 * Notes:  Waive is org-scoped to block a cross-org write (A1 hotfix 2026-07-02): every read and
 *         the update filter org_id, and a caseId outside the org waives nothing.
 */
import { format } from "date-fns"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

/**
 * Accrue one day of interest on an arrears case.
 * Called by daily cron. Idempotent — skips if charge exists for date.
 *
 * Formula: simple interest, prime + margin
 *   daily_interest = (arrears_balance × (prime + margin) / 100) / 365
 *   rounded to nearest cent
 */
export async function accrueArrearsInterest(
  caseId: string,
  forDate: Date = new Date()
): Promise<{ interestCents: number; skipped: boolean }> {
  const supabase = await createServiceClient()

  const { data: arrearsCase, error: arrearsCaseError } = await supabase
    .from("arrears_cases")
    .select(`
      id, org_id, lease_id, tenant_id,
      total_arrears_cents, status,
      leases (
        arrears_interest_enabled,
        arrears_interest_margin_percent
      )
    `)
    .eq("id", caseId)
    .single()
    logQueryError("accrueArrearsInterest arrears_cases", arrearsCaseError)

  if (!arrearsCase) return { interestCents: 0, skipped: true }

  // Skip if interest disabled on this lease
  const lease = arrearsCase.leases as unknown as {
    arrears_interest_enabled: boolean
    arrears_interest_margin_percent: number
  } | null

  if (!lease?.arrears_interest_enabled) {
    return { interestCents: 0, skipped: true }
  }

  // Skip if case is resolved/written off/vacated
  const inactiveStatuses = ["resolved", "written_off", "vacated_with_debt"]
  if (inactiveStatuses.includes(arrearsCase.status)) {
    return { interestCents: 0, skipped: true }
  }

  // Skip if no arrears balance
  if (!arrearsCase.total_arrears_cents || arrearsCase.total_arrears_cents <= 0) {
    return { interestCents: 0, skipped: true }
  }

  const chargeDate = format(forDate, "yyyy-MM-dd")
  const marginPercent = lease.arrears_interest_margin_percent ?? 2

  // Get prime rate for this date
  const { data: primeData, error: primeDataError } = await supabase
    .rpc("get_prime_rate_on", { check_date: chargeDate })
    logQueryError("accrueArrearsInterest rpc:get_prime_rate_on", primeDataError)

  const primeRate: number = (primeData as number | null) ?? 11.25
  const effectiveRate = primeRate + marginPercent

  // Calculate daily interest
  const interestCents = Math.round(
    (arrearsCase.total_arrears_cents * effectiveRate / 100) / 365
  )

  if (interestCents <= 0) return { interestCents: 0, skipped: true }

  // Insert — unique constraint prevents duplicates (idempotent)
  const { error } = await supabase
    .from("arrears_interest_charges")
    .insert({
      org_id: arrearsCase.org_id,
      arrears_case_id: caseId,
      lease_id: arrearsCase.lease_id,
      tenant_id: arrearsCase.tenant_id,
      charge_date: chargeDate,
      principal_cents: arrearsCase.total_arrears_cents,
      prime_rate_percent: primeRate,
      margin_percent: marginPercent,
      effective_rate_percent: effectiveRate,
      interest_cents: interestCents,
    })

  if (error?.code === "23505") {
    // Already charged for this date
    return { interestCents: 0, skipped: true }
  }

  // Refresh summary on arrears_cases
  await supabase.rpc("refresh_arrears_interest_total", { p_case_id: caseId })

  return { interestCents, skipped: false }
}

/**
 * Waive all outstanding interest on an arrears case.
 * Agent offers: "pay by Friday and I'll waive interest"
 * Charges are IMMUTABLE — only marked as waived, never deleted.
 */
export async function waiveArrearsInterest(
  caseId: string,
  orgId: string,
  agentUserId: string,
  reason: string
): Promise<{ waivedCents: number; chargesWaived: number }> {
  const supabase = await createServiceClient()

  // Org-scope guard — the service client bypasses RLS, so confirm the case belongs to the
  // caller's org before touching anything. A caseId from another org matches no row → no-op.
  const { data: arrearsCase, error: caseError } = await supabase
    .from("arrears_cases")
    .select("org_id")
    .eq("id", caseId)
    .eq("org_id", orgId)
    .single()
    logQueryError("waiveArrearsInterest arrears_cases", caseError)

  if (!arrearsCase) {
    return { waivedCents: 0, chargesWaived: 0 }
  }

  const { data: charges, error: chargesError } = await supabase
    .from("arrears_interest_charges")
    .select("id, interest_cents")
    .eq("arrears_case_id", caseId)
    .eq("org_id", orgId)
    .eq("waived", false)
    logQueryError("waiveArrearsInterest arrears_interest_charges", chargesError)

  if (!charges || charges.length === 0) {
    return { waivedCents: 0, chargesWaived: 0 }
  }

  const waivedCents = charges.reduce((sum, c) => sum + c.interest_cents, 0)
  const ids = charges.map((c) => c.id)

  await supabase
    .from("arrears_interest_charges")
    .update({
      waived: true,
      waived_by: agentUserId,
      waived_at: new Date().toISOString(),
      waived_reason: reason,
    })
    .eq("org_id", orgId)
    .in("id", ids)

  // Refresh summary
  await supabase.rpc("refresh_arrears_interest_total", { p_case_id: caseId })

  // Audit log — org comes from the validated caller, not a post-write re-read.
  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "arrears_interest_charges",
    record_id: caseId,
    action: "UPDATE",
    changed_by: agentUserId,
    new_values: {
      action: "interest_waived",
      charges_waived: charges.length,
      total_waived_cents: waivedCents,
      reason,
    },
  })

  return { waivedCents, chargesWaived: charges.length }
}
