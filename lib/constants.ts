export const APP_NAME = "Pleks"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export const TIER_ORDER = { owner: 0, steward: 1, portfolio: 2, firm: 3 } as const
export type Tier = keyof typeof TIER_ORDER

export const TIER_LIMITS = {
  owner: { units: 1, users: 1 },
  steward: { units: 10, users: 2 },
  portfolio: { units: 30, users: 5 },
  firm: { units: null, users: null },
} as const

export const TIER_PRICING = {
  owner: { monthly: 0, annual: 0 },
  steward: { monthly: 59900, annual: 575000 },
  portfolio: { monthly: 99900, annual: 959000 },
  firm: { monthly: 249900, annual: 2399000 },
} as const

export const OVERAGE_RATE_CENTS = 3500

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

// Currency formatting (South African Rand)
export function formatZAR(cents: number, showCents = false): string {
  const rands = cents / 100
  const formatted = rands.toLocaleString("en-ZA", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
  return `R ${formatted}`
}
