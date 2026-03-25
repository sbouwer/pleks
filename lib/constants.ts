export const APP_NAME = "Pleks"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export const TIER_ORDER = { owner: 0, steward: 1, portfolio: 2, firm: 3 } as const
export type Tier = keyof typeof TIER_ORDER

export const TIER_LIMITS = {
  owner: { units: 1, users: 1 },
  steward: { units: 20, users: 2 },
  portfolio: { units: 50, users: 5 },
  firm: { units: null, users: null },
} as const

export const TIER_PRICING = {
  owner: { monthly: 0, annual: 0 },
  steward: { monthly: 59900, annual: 575000 },
  portfolio: { monthly: 99900, annual: 959000 },
  firm: { monthly: 249900, annual: 2399000 },
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
export function formatZAR(cents: number, showCents = false): string {
  const rands = cents / 100
  const formatted = rands.toLocaleString("en-ZA", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
  return `R ${formatted}`
}
