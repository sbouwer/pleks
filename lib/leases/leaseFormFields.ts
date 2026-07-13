/**
 * lib/leases/leaseFormFields.ts — parse the lease form into typed fields. PURE: no DB, no auth.
 *
 * Notes:  Extracted from `lib/actions/leases.ts` because that file is `"use server"`, and EVERY export from a
 *         "use server" module must be an async function — a synchronous export breaks `next build` (and only
 *         `next build`: tsc compiles it happily, so the failure surfaces at deploy, not at check).
 *
 *         It is exported so the field-ablation harness can drive it directly: remove one form field at a time
 *         and see which defaults speak on the agency's behalf. The parser is where the `|| N` → `?? N` fixes
 *         live, and those are money terms — a deliberate ZERO must survive.
 */

import { addCalendarMonths } from "@/lib/dates"

export type LeaseFormFields = {
  unitId: string
  propertyId: string
  tenantId: string
  leaseType: string
  tenantIsJuristic: boolean
  cpaApplies: boolean
  isFranchiseAgreement: boolean
  startDate: string
  endDate: string | null
  isFixedTerm: boolean
  noticePeriod: number
  rentCents: number
  paymentDueDay: string
  escalationPercent: number
  escalationType: string
  depositCents: number | null
  depositInterestTo: string
  depositInterestRatePercent: number | null
  arrearsInterestEnabled: boolean
  arrearsInterestMarginPercent: number
  specialTerms: unknown[]
  escalationReviewDate: string
}

/**
 * EXPORTED for field ablation (lib/actions/__tests__/leaseForm.ablation.test.ts). Pure — no DB, no auth — so
 * the harness can remove one form field at a time and see which defaults speak on the agency's behalf.
 */
/**
 * A stated number, or null when the field is absent/blank/unparseable. The point is `??`, not `||`:
 * in JavaScript 0 is FALSY, so `parseFloat(x) || 10` throws away a legitimate, deliberate ZERO and replaces it
 * with the default. That is not a fallback — it is an OVERRIDE, and on these fields it moves money.
 */
function statedNumber(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) as string | null)?.trim()
  if (!raw) return null
  const n = Number.parseFloat(raw)
  return Number.isNaN(n) ? null : n
}

export function parseLeaseFormData(formData: FormData): LeaseFormFields {
  const leaseType = (formData.get("lease_type") as string) || "residential"
  const cpaApplies = formData.get("cpa_applies") !== "false"
  const startDate = formData.get("start_date") as string
  const endDate = (formData.get("end_date") as string) || null
  const isFixedTerm = formData.get("is_fixed_term") !== "false"

  // setFullYear/getFullYear are LOCAL-time accessors and the result was sliced in UTC — mixed coordinates.
  const escalationReviewDate = addCalendarMonths(startDate, 12)

  // The CPA s14(2)(b)(ii) expiry-notice date is NO LONGER stamped here. It used to be `endDate − 40 calendar
  // days`, which is ~27 business days — statutorily too late (the Act requires 40–80 BUSINESS days). It is
  // now DERIVED at evaluation time by the lease-expiry-check cron via lib/leases/cpaRenewal, so it self-heals
  // and never drifts. `auto_renewal_notice_due` is being dropped (ADDENDUM_70K §6).

  const arrearsInterestEnabled = formData.get("arrears_interest_enabled") === "true"

  const depositInterestRateRaw = formData.get("deposit_interest_rate") as string
  const specialTermsRaw = formData.get("special_terms") as string
  let specialTerms: unknown[] = []
  try { specialTerms = specialTermsRaw ? JSON.parse(specialTermsRaw) : [] } catch { /* empty */ }

  return {
    unitId: formData.get("unit_id") as string,
    propertyId: formData.get("property_id") as string,
    tenantId: formData.get("tenant_id") as string,
    leaseType,
    tenantIsJuristic: formData.get("tenant_is_juristic") === "true",
    cpaApplies,
    isFranchiseAgreement: formData.get("is_franchise_agreement") === "true",
    startDate,
    endDate,
    isFixedTerm,
    // `?? 20`, not `|| 20`: a stated 0 is a stated 0.
    noticePeriod: statedNumber(formData, "notice_period_days") ?? 20,
    rentCents: Math.round(Number.parseFloat(formData.get("rent_amount") as string) * 100),
    paymentDueDay: (formData.get("payment_due_day") as string) || "1",
    // `|| 10` turned a lease that says "the rent does NOT escalate" (0%) into one that rises 10% a year,
    // compounding, for the life of the lease. The agency's own stated choice, silently overridden.
    escalationPercent: statedNumber(formData, "escalation_percent") ?? 10,
    escalationType: (formData.get("escalation_type") as string) || "fixed",
    depositCents: formData.get("deposit_amount")
      ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100)
      : null,
    depositInterestTo: leaseType === "residential" ? "tenant" : ((formData.get("deposit_interest_to") as string) || "landlord"),
    depositInterestRatePercent: depositInterestRateRaw ? Number.parseFloat(depositInterestRateRaw) : null,
    // EXPLICIT OPT-IN. This used to be `!== "false"`, so an ABSENT field read as TRUE — and
    // buildUploadedFormData (CreateStep.tsx) never sets it. So uploading an existing lease silently switched
    // arrears interest ON at a 2% margin (`|| 2`) that nobody chose, on a document Pleks did not even
    // generate. Charging a tenant interest is not something silence should consent to.
    arrearsInterestEnabled,
    // A stated 0% margin is a real choice — an agency that charges no margin. `|| 2` overrode it.
    arrearsInterestMarginPercent: statedNumber(formData, "arrears_interest_margin") ?? (arrearsInterestEnabled ? 2 : 0),
    specialTerms,
    escalationReviewDate: escalationReviewDate,
  }
}
