import { TIER_ORDER, type Tier } from "@/lib/constants"

const TIER_FEATURES_OWNER = [
  "lease_create",
  "lease_sign", // create + download PDF for manual signing (no DocuSeal API)
  "tenant_portal",
  "maintenance_log", // manual category + urgency (no AI triage)
  "basic_invoicing",
  "inspection_basic", // manual assessment (no AI)
] as const

const TIER_FEATURES_STEWARD = [
  ...TIER_FEATURES_OWNER,
  "bank_recon",
  "owner_statements",
  "inspection_unlimited",
  "reports_basic",
  "ai_maintenance_triage", // Haiku — auto category + urgency
  "ai_inspection", // Sonnet — wear & tear assessment
  "docuseal_signing", // DocuSeal API — embedded digital signing ($0.20/doc)
  "sms_notifications", // Africa's Talking SMS (R0.20/SMS)
  "fitscore_paypercheck",
] as const

const TIER_FEATURES_PORTFOLIO = [
  ...TIER_FEATURES_STEWARD,
  "debicheck",
  "arrears_automation",
  "ai_full", // Sonnet — bank statements, FitScore, lease drafting, etc.
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
  "opus_ai", // Opus — tribunal submissions, legal docs
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
