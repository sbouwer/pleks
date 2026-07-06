/**
 * lib/constants.ts — App-wide constants: tier model, pricing, org/lease enums, and ZAR formatters
 *
 * Notes:  TIER_ORDER/TIER_LIMITS/TIER_PRICING drive canActivateLease and subscription gating.
 *         No annual pricing — monthly only. Bespoke is a real tier (monthly base + per-lease
 *         pricing, enterprise, year 2+). No seat caps. No overage charges; activation is
 *         blocked at the lease cap and the user is prompted to upgrade.
 */
export const APP_NAME = "Pleks"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

/**
 * SA prime lending rate = SARB repo rate + this spread. Fixed at 3.50% by SARB/banking convention
 * (the Reserve Bank sets the spread; it has been 3.5% since 2008). prime-rate-sync adds it to the repo
 * rate from the rate feed. If SARB ever changes the spread, update it HERE (single source of truth) —
 * it is load-bearing (drives arrears interest), so it must never be a magic number buried in a cron.
 */
export const SA_PRIME_REPO_SPREAD = 3.5

export const TIER_ORDER = { owner: 0, steward: 1, growth: 2, portfolio: 3, firm: 4, bespoke: 5 } as const
export type Tier = keyof typeof TIER_ORDER

// Maximum active leases per tier. null = unlimited (custom/bespoke contract).
export const TIER_LIMITS = {
  owner:     { leases: 1 },
  steward:   { leases: 15 },
  growth:    { leases: 30 },
  portfolio: { leases: 75 },
  firm:      { leases: 150 },
  bespoke:   { leases: null },
} as const

// Monthly pricing in cents only — no annual option.
// Bespoke: monthly base + per-lease charge; pricing agreed on contract, null here.
export const TIER_PRICING = {
  owner:     { monthly: 0 },
  steward:   { monthly: 69900 },
  growth:    { monthly: 119900 },
  portfolio: { monthly: 259900 },
  firm:      { monthly: 449900 },
  bespoke:   { monthly: null },
} as const

// ── Product line (ADDENDUM_18C) ─────────────────────────────────────────────────
// New first-class org axis (organisations.product_line): which product FAMILY the account runs —
// 'residential' (rentals: leases, tenants, applications) or 'hoa' (standalone body-corporate /
// managing-agent operations, no lease surface). Drives the tier ladder, feature map, and active
// surface set. Orthogonal to org type (framing) and role (per-user permissions). Every pre-18C org
// is 'residential' (DB DEFAULT backfill — NR-2: residential behaviour is byte-identical).
export const PRODUCT_LINES = ["residential", "hoa"] as const
export type ProductLine = (typeof PRODUCT_LINES)[number]

// HOA product-line tier ladder — its OWN ordered map. Ordinals are ONLY comparable within a line;
// never compare an HOA tier against a residential (TIER_ORDER) tier. Placeholder names + provisional
// unit bands, GTM-confirmable (Phase 3): studio ≈ boutique (2–4 schemes), practice ≈ one estate /
// ~10 schemes, firm ≈ multi-scheme, bespoke = enterprise/custom. (D-18C-02, answered 2026-07-06.)
export const HOA_TIER_ORDER = { hoa_studio: 0, hoa_practice: 1, hoa_firm: 2, hoa_bespoke: 3 } as const
export type HoaTier = keyof typeof HOA_TIER_ORDER

// Either-line tier. Only the FEW cross-line helpers (hasFeature/hasAccess) accept this; the tier's own
// literal identifies its line (residential and HOA literals are disjoint), so no product_line param is
// needed. Record<Tier> maps + TIER_ORDER indexing stay residential-only — do NOT widen `Tier`.
export type AnyTier = Tier | HoaTier

// Cap on TOTAL UNITS under management per HOA tier (D-18C-07 — cap basis = units, not schemes).
// null = unlimited (bespoke/custom contract). Numbers provisional — confirm at GTM. canCreateHoaEntity()
// reads this (Stage 2).
export const HOA_LIMITS = {
  hoa_studio:   { units: 300 },
  hoa_practice: { units: 1200 },
  hoa_firm:     { units: 3000 },
  hoa_bespoke:  { units: null },
} as const

// Founding agent pricing (first 10 clients — 24-month lock)
export const FOUNDING_AGENT_PRICE_CENTS = 29900 // R299/month
export const FOUNDING_AGENT_DURATION_MONTHS = 24

// Application screening fees (D-003 REVISED)
export const APPLICATION_FEE_CENTS = 39900 // R399 Stage 2 single
export const JOINT_APPLICATION_FEE_CENTS = 74900 // R749 Stage 2 joint
export const INCOME_AFFORDABILITY_THRESHOLD = 0.3 // 30% of gross income — PRINCIPAL/co-applicant ceiling (rent ÷ combined gross; ≈ income ≥ 3.33× rent)
// Guarantor/surety floor — DECOUPLED from and STRICTER than the principal threshold. A guarantor must cover the
// WHOLE lease on default (not share it), so their independent income is checked against a higher multiple of rent
// (industry 4–6×; 4× ⇒ rent ≤ 25% of guarantor income). Tunable strictness dial; guarantor income is NEVER summed
// into combined affordability — it produces a separate guarantee-strength signal. (ADDENDUM_14M J4)
export const GUARANTOR_MIN_INCOME_MULTIPLE = 4
export const PROBATION_MONTHS = 3 // typical SA probation window — an inference for screening, NOT a legal status
// Applicants get the initial pre-screen + exactly ONE adjustment (re-check). Caps Sonnet cost + gaming;
// after this the agent reviews. Hard-enforced server-side (submit + /screen) AND surfaced clearly in the UI.
export const MAX_SCREENING_ITERATIONS = 2

/** Inference only: did employment start within the probation window? SA probation isn't fixed (it varies by
 *  contract/sector), so callers must surface this as agent-facing evidence — never a silent filter. */
export function startedWithinProbation(startDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!startDate) return false
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return false
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - PROBATION_MONTHS)
  return start > cutoff
}

// hoa_manager (ADDENDUM_18C D-18C-03): standalone HOA-management company — lease-less, reuses the
// agent role + AAL2 (NR-4, no new portal). Distinct capability profile added in Stage 2; until then
// it falls through to the agency-like default in getOrgCapabilities (no existing org is hoa_manager).
export const ORG_TYPES = ["agency", "landlord", "sole_prop", "hoa_manager"] as const
export type OrgType = (typeof ORG_TYPES)[number]

export const USER_ROLES = [
  "owner",
  "property_manager",
  "agent",
  "accountant",
  "maintenance_manager",
] as const
export type UserRole = (typeof USER_ROLES)[number]

export const LEASE_TYPES = ["residential", "commercial"] as const
export type LeaseType = (typeof LEASE_TYPES)[number]

export const SA_PROVINCES = [
  "Western Cape",
  "Eastern Cape",
  "Northern Cape",
  "North West",
  "Free State",
  "KwaZulu-Natal",
  "Gauteng",
  "Limpopo",
  "Mpumalanga",
] as const

export const DEFAULT_COUNTRY = "South Africa"

// Contacts can be abroad — South Africa first, then common countries. Province becomes free text off South Africa.
export const COUNTRIES = [
  "South Africa",
  "Namibia", "Botswana", "Zimbabwe", "Mozambique", "Eswatini", "Lesotho", "Zambia", "Malawi", "Mauritius",
  "United Kingdom", "Ireland", "Netherlands", "Belgium", "Germany", "France", "Spain", "Portugal", "Italy",
  "Switzerland", "Austria", "Denmark", "Sweden", "Norway", "Finland", "Greece", "Poland",
  "United States", "Canada", "Australia", "New Zealand",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "Israel",
  "India", "China", "Hong Kong", "Singapore", "Japan",
  "Nigeria", "Kenya", "Ghana", "Egypt", "Brazil", "Argentina", "Other",
] as const

export const UNIT_FEATURES = [
  "Pool",
  "Garden",
  "Solar",
  "Borehole",
  "Alarm",
  "Garage",
  "Carport",
  "Fibre",
  "DSTV",
  "Pet-friendly",
  "Wheelchair-accessible",
  "Air-conditioning",        // maps to `aircon` clause
] as const

export const DOCUMENT_TYPES = [
  { value: "title_deed", label: "Title Deed" },
  { value: "compliance_certificate", label: "Compliance Certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "rates_clearance", label: "Rates Clearance" },
  { value: "levy_schedule", label: "Levy Schedule" },
  { value: "plans", label: "Plans" },
  { value: "electrical_coc", label: "Electrical COC" },
  { value: "gas_coc", label: "Gas COC" },
  { value: "beetle_coc", label: "Beetle COC" },
  { value: "other", label: "Other" },
] as const

// Currency formatting (South African Rand)
export function formatZARAbbrev(cents: number): string {
  const rands = cents / 100
  if (rands >= 1_000_000) return `R ${(rands / 1_000_000).toFixed(1)}m`
  if (rands >= 10_000) return `R ${Math.round(rands / 1000)}k`
  return formatZAR(cents)
}

export function formatZAR(cents: number, showCents = false): string {
  const rands = cents / 100
  const formatted = rands.toLocaleString("en-ZA", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
  return `R ${formatted}`
}
