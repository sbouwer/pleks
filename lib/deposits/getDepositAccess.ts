export type DepositAccess = "full_residential" | "full_commercial" | "restricted" | "blocked"

interface OrgComplianceData {
  management_scope: string | null
  property_types: string[]
  has_trust_account: boolean | null
  has_deposit_account: boolean | null
}

export function getDepositAccess(
  org: OrgComplianceData,
  leaseType: "residential" | "commercial"
): DepositAccess {
  const scope = org.management_scope
  const hasTrust = org.has_trust_account === true
  const hasDepositAccount = org.has_deposit_account === true

  // Commercial lease — contractual only, no RHA
  if (leaseType === "commercial") {
    // Practitioners still need trust account (PPRA — all client funds)
    if (scope !== "own_only") {
      return hasTrust ? "full_commercial" : "restricted"
    }
    // Private landlord, own commercial property — no statutory requirement
    return "full_commercial"
  }

  // Residential lease — RHA applies
  if (scope === "own_only") {
    // Private landlord: needs interest-bearing account (RHA s5)
    return hasDepositAccount ? "full_residential" : "restricted"
  }

  // Practitioner (B or C): needs PPRA trust account
  return hasTrust ? "full_residential" : "blocked"
}

export const DEPOSIT_FEATURES: Record<DepositAccess, readonly string[]> = {
  full_residential: [
    "deposit_record",
    "deposit_receipt_pdf",
    "interest_calculation",
    "reconciliation_engine",
    "deduction_schedule",
    "tribunal_report",
    "deposit_return_timer_statutory",
  ],
  full_commercial: [
    "deposit_record",
    "deposit_receipt_pdf",
    "reconciliation_commercial",
    "deduction_schedule",
    "deposit_return_timer_contractual",
  ],
  restricted: ["deposit_record"],
  blocked: ["deposit_record"],
}

export function canUseDepositFeature(access: DepositAccess, feature: string): boolean {
  return DEPOSIT_FEATURES[access].includes(feature)
}
