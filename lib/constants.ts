/**
 * lib/constants.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
export const APP_NAME = "Pleks"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

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

// Monthly pricing in cents. Annual pricing deferred post-traction.
// Bespoke pricing is per-agreement (bespoke_min_monthly_cents + bespoke_per_lease_cents on subscriptions).
export const TIER_PRICING = {
  owner:     { monthly: 0 },
  steward:   { monthly: 69900 },
  growth:    { monthly: 119900 },
  portfolio: { monthly: 259900 },
  firm:      { monthly: 449900 },
  bespoke:   { monthly: null },
} as const

export const OVERAGE_RATE_CENTS = 3500

// Founding agent pricing (first 10 clients — 24-month lock)
export const FOUNDING_AGENT_PRICE_CENTS = 29900 // R299/month
export const FOUNDING_AGENT_DURATION_MONTHS = 24

// Application screening fees (D-003 REVISED)
export const APPLICATION_FEE_CENTS = 39900 // R399 Stage 2 single
export const JOINT_APPLICATION_FEE_CENTS = 74900 // R749 Stage 2 joint
export const INCOME_AFFORDABILITY_THRESHOLD = 0.3 // 30% of gross income

export const ORG_TYPES = ["agency", "landlord", "sole_prop"] as const
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
