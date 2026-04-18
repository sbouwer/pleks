/**
 * CPA applicability derivation — ADDENDUM_04A
 *
 * Pure function. No DB calls, no time-dependent logic.
 * Same input always produces the same output.
 *
 * Called from:
 *  - LeaseWizard ReviewStep (preview, not persisted)
 *  - markAsSigned() (final — result is written to the lease row)
 */

export type CpaCategory =
  | "natural_person"
  | "franchise_agreement"
  | "juristic_under_threshold"
  | "juristic_over_threshold"
  | "indeterminate_bands"

export type CpaApplies = "yes" | "no" | "indeterminate"

export interface CpaDeterminationInput {
  tenant: {
    entityType: "individual" | "organisation" | string | null
    juristicType: string | null
    turnoverUnder2m: boolean | null
    assetValueUnder2m: boolean | null
    sizeBandsCapturedAt: string | null
  }
  lease: {
    isFranchiseAgreement: boolean
  }
}

export interface CpaDetermination {
  applies: CpaApplies
  category: CpaCategory
  notes: string
  canActivate: boolean
}

const NATURAL_PERSON_TYPES = new Set(["individual", "natural_person"])

export function determineCpaApplicability(
  input: CpaDeterminationInput,
): CpaDetermination {
  const { tenant, lease } = input

  // Rule 1: natural person or sole proprietor → CPA always applies
  if (
    NATURAL_PERSON_TYPES.has(tenant.entityType ?? "") ||
    tenant.juristicType === "sole_proprietor"
  ) {
    return {
      applies: "yes",
      category: "natural_person",
      notes: "Natural person tenant — CPA applies automatically (CPA s5(2)).",
      canActivate: true,
    }
  }

  // Rule 2: franchise agreement → CPA always applies
  if (lease.isFranchiseAgreement) {
    return {
      applies: "yes",
      category: "franchise_agreement",
      notes: "Franchise agreement — CPA applies regardless of tenant size (CPA s5(6)).",
      canActivate: true,
    }
  }

  // Rule 3: juristic with unknown size bands → indeterminate
  if (tenant.turnoverUnder2m === null || tenant.assetValueUnder2m === null) {
    return {
      applies: "indeterminate",
      category: "indeterminate_bands",
      notes:
        "Juristic tenant with unknown size bands. Capture turnover and asset value to proceed.",
      canActivate: false,
    }
  }

  // Rule 4: both bands under threshold → CPA applies
  if (tenant.turnoverUnder2m && tenant.assetValueUnder2m) {
    const captured = tenant.sizeBandsCapturedAt
      ? new Date(tenant.sizeBandsCapturedAt).toLocaleDateString("en-ZA")
      : "date unknown"
    return {
      applies: "yes",
      category: "juristic_under_threshold",
      notes: `Juristic tenant. Both turnover and asset value reported below R2m threshold (captured ${captured}). CPA applies under s5(2)(b) / s6.`,
      canActivate: true,
    }
  }

  // Rule 5: at least one band at or above threshold → CPA does not apply
  const captured = tenant.sizeBandsCapturedAt
    ? new Date(tenant.sizeBandsCapturedAt).toLocaleDateString("en-ZA")
    : "date unknown"
  return {
    applies: "no",
    category: "juristic_over_threshold",
    notes: `Juristic tenant. turnover_under_2m=${String(tenant.turnoverUnder2m)}, asset_value_under_2m=${String(tenant.assetValueUnder2m)} (captured ${captured}). At least one threshold met or exceeded. CPA does not apply under s6.`,
    canActivate: true,
  }
}
