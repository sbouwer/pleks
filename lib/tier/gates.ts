import { TIER_ORDER, type Tier } from "@/lib/constants"

const TIER_FEATURES_OWNER = [
  "lease_create",
  "lease_sign",
  "tenant_portal",
  "maintenance_log",
  "basic_invoicing",
  "inspection_basic",
] as const

const TIER_FEATURES_STEWARD = [
  ...TIER_FEATURES_OWNER,
  "bank_recon",
  "owner_statements",
  "inspection_unlimited",
  "reports_basic",
  "ai_maintenance_triage",
  "fitscore_paypercheck",
] as const

const TIER_FEATURES_PORTFOLIO = [
  ...TIER_FEATURES_STEWARD,
  "debicheck",
  "arrears_automation",
  "ai_full",
  "fitscore_included",
  "lightstone_avm",
  "application_pipeline",
  "municipal_bills",
  "reports_full",
  "lease_automation",
] as const

const TIER_FEATURES_FIRM = [
  ...TIER_FEATURES_PORTFOLIO,
  "hoa_module",
  "body_corporate",
  "sectional_title",
  "fitscore_unlimited",
  "eaab_tools",
  "opus_ai",
  "contractor_portal",
  "custom_templates",
] as const

export const TIER_FEATURES: Record<Tier, readonly string[]> = {
  owner: TIER_FEATURES_OWNER,
  steward: TIER_FEATURES_STEWARD,
  portfolio: TIER_FEATURES_PORTFOLIO,
  firm: TIER_FEATURES_FIRM,
}

export function hasFeature(tier: Tier, feature: string): boolean {
  return TIER_FEATURES[tier].includes(feature)
}

export function hasAccess(orgTier: Tier, requiredTier: Tier): boolean {
  return TIER_ORDER[orgTier] >= TIER_ORDER[requiredTier]
}
