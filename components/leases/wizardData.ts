/**
 * components/leases/wizardData.ts — shared lease-wizard data shape + defaults
 *
 * Auth:   client-only data shape; the save path (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   in-memory WizardData held by LeaseWizardContext; prefilled from the unit/property/tenant fetch
 * Notes:  Extracted from the old LeaseWizard.tsx so the unified LeaseWizardModal + its content-only steps
 *         and the API conflict-checker can share the types without importing a React component. Only the
 *         TYPE/value exports moved here — the LeaseWizard component is gone (absorbed into LeaseWizardModal).
 */

export interface LocalCharge {
  id: string
  description: string
  charge_type: string
  amount_cents: number
  start_date: string
  end_date: string | null
  payable_to: string
  deduct_from_owner_payment: boolean
}

export interface LocalOnceOffCharge {
  id: string
  description: string
  charge_type: string
  amount_cents: number
  payable_to: string
}

export interface SpecialTerm {
  type: string
  detail: string
}

export interface CoTenant {
  id: string
  name: string
  /** true when this co-lessee signs for a company tenant (→ lease_co_tenants.is_signatory). */
  isSignatory?: boolean
  /** the underlying contact id (set for promoted company signatories) — lets the picker dedupe candidates. */
  contactId?: string
}

export interface AnnexureCRules {
  pets: string
  smoking: string
  parking: string
  noise: string
  commonAreas: string
}

/** An org bank account selectable in Annexure B (trust/deposit/ppra; never business). Number masked. */
export interface SelectableAccount {
  id: string
  type: string
  bankName: string
  accountHolder: string
  accountNumberMasked: string
  branchCode: string
}

export interface WizardData {
  // Step 1 — Property → Building → Unit
  propertyId: string
  propertyName: string
  buildingId: string
  buildingName: string
  unitId: string
  unitLabel: string
  leaseType: "residential" | "commercial"
  askingRentCents: number | null
  /** durable straddle default carried from the unit (BUILD_69) — seeds the lease end date on a 2nd+ lease. */
  defaultLeasePeriodMonths: number | null
  /** live SA prime rate (prime_rates table) resolved server-side — drives the arrears-interest preview, never hardcoded. */
  currentPrimePercent: number | null
  /** the org's non-business bank accounts (trust/deposit/ppra), selectable in Annexure B (ADDENDUM_69A). */
  availableAccounts: SelectableAccount[]
  /** the per-lease selected trust (rent) + deposit (deposit-holding) accounts. */
  trustAccountId: string
  depositAccountId: string
  bcLevyCents: number | null
  // Step 2 — Tenant(s)
  tenantId: string
  tenantName: string
  coTenants: CoTenant[]
  // Step 3 — Lease details (terms)
  startDate: string
  endDate: string
  isFixedTerm: boolean
  noticePeriod: string
  rent: string
  deposit: string
  paymentDueDay: string
  escalationPercent: string
  escalationType: string
  depositInterestTo: string
  depositInterestRate: string
  arrearsInterestEnabled: boolean
  arrearsMargin: string
  cpaApplies: boolean
  tenantIsJuristic: boolean
  isFranchiseAgreement: boolean
  tenantJuristicType: string | null
  tenantTurnoverUnder2m: boolean | null
  tenantAssetUnder2m: boolean | null
  tenantSizeBandsCapturedAt: string | null
  // Step 1 — metadata (not editable, from property/unit fetch)
  isSectionalTitle: boolean
  parkingBays: number
  hasSchemeRules: boolean
  // Step 3 — charges
  charges: LocalCharge[]
  onceOffCharges: LocalOnceOffCharge[]
  // Step 3 — clauses
  clauseSelections: Record<string, boolean>
  acknowledgedConflicts: string[]
  // Step 3 — annexures
  annexureCRules: AnnexureCRules
  specialTerms: SpecialTerm[]
}

export const DEFAULT_ANNEXURE_C_RULES: AnnexureCRules = {
  pets: "No pets permitted without prior written consent of the Landlord.",
  smoking: "Smoking is strictly prohibited inside the premises.",
  parking: "One (1) parking bay allocated to the Tenant.",
  noise: "No excessive noise after 22:00 or before 07:00 on weekdays, or after 23:00 on weekends.",
  commonAreas: "Common areas must be kept clean and clear of personal belongings.",
}

export interface WizardPrefill {
  propertyId?: string | null
  propertyName?: string | null
  unitId?: string | null
  unitLabel?: string | null
  /** Durable unit fields carried so the rent/term seed even when the unit-select step is skipped (BUILD_69). */
  askingRentCents?: number | null
  defaultLeasePeriodMonths?: number | null
  /** live SA prime (prime_rates) resolved server-side for the arrears-interest preview. */
  currentPrimePercent?: number | null
  /** selectable org accounts + pre-selected trust/deposit ids for the banking annexure. */
  availableAccounts?: SelectableAccount[]
  trustAccountId?: string
  depositAccountId?: string
  tenantId?: string | null
  tenantName?: string | null
  coTenants?: CoTenant[]
}

/** Build the initial WizardData from the server-resolved prefill (URL params, owner tier, renewal). */
export function buildInitialWizardData(prefill: WizardPrefill): WizardData {
  return {
    propertyId: prefill.propertyId ?? "",
    propertyName: prefill.propertyName ?? "",
    buildingId: "",
    buildingName: "",
    unitId: prefill.unitId ?? "",
    unitLabel: prefill.unitLabel ?? "",
    leaseType: "residential",
    askingRentCents: prefill.askingRentCents ?? null,
    defaultLeasePeriodMonths: prefill.defaultLeasePeriodMonths ?? null,
    currentPrimePercent: prefill.currentPrimePercent ?? null,
    availableAccounts: prefill.availableAccounts ?? [],
    trustAccountId: prefill.trustAccountId ?? "",
    depositAccountId: prefill.depositAccountId ?? "",
    bcLevyCents: null,
    tenantId: prefill.tenantId ?? "",
    tenantName: prefill.tenantName ?? "",
    coTenants: prefill.coTenants ?? [],
    startDate: "",
    endDate: "",
    isFixedTerm: true,
    noticePeriod: "20",
    rent: "",
    deposit: "",
    paymentDueDay: "1",
    escalationPercent: "8",
    escalationType: "fixed",
    depositInterestTo: "tenant",
    depositInterestRate: "5",
    arrearsInterestEnabled: true,
    arrearsMargin: "2",
    cpaApplies: true,
    tenantIsJuristic: false,
    isFranchiseAgreement: false,
    tenantJuristicType: null,
    tenantTurnoverUnder2m: null,
    tenantAssetUnder2m: null,
    tenantSizeBandsCapturedAt: null,
    isSectionalTitle: false,
    parkingBays: 0,
    hasSchemeRules: false,
    charges: [],
    onceOffCharges: [],
    clauseSelections: {},
    acknowledgedConflicts: [],
    annexureCRules: { ...DEFAULT_ANNEXURE_C_RULES },
    specialTerms: [],
  }
}
