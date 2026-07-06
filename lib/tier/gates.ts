/**
 * lib/tier/gates.ts — feature gate helpers for tier-based access control
 *
 * Data:   static — feature lists are compile-time constants, no DB reads
 * Notes:  TIER_FEATURES is the source of truth for what each tier can do.
 *         hasFeature() is the only call site check — use it everywhere, never
 *         compare tier strings directly.
 */
import { TIER_ORDER, HOA_TIER_ORDER, type Tier, type HoaTier, type AnyTier } from "@/lib/constants"

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
  "sms_notifications",      // Africa's Talking SMS (R0.20/SMS)
  "whatsapp_notifications", // Africa's Talking WhatsApp Business (Steward+; Owner uses email only)
  "fitscore_paypercheck",
  "property_intelligence",  // ADDENDUM_14A: Deeds/Lightstone/CIPC PAYG pulls (D-14A-16, D-14A-17)
] as const

const TIER_FEATURES_PORTFOLIO = [
  ...TIER_FEATURES_STEWARD,
  "arrears_automation",
  "ai_full", // Sonnet — bank statements, FitScore, lease drafting, etc.
  "fitscore_included",
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
  owner:     TIER_FEATURES_OWNER,
  steward:   TIER_FEATURES_STEWARD,
  growth:    TIER_FEATURES_STEWARD,
  portfolio: TIER_FEATURES_PORTFOLIO,
  firm:      TIER_FEATURES_FIRM,
  bespoke:   TIER_FEATURES_FIRM,
}

// ── HOA product line (ADDENDUM_18C D-18C-06) ────────────────────────────────────
// The standalone HOA / body-corporate management line. hoa_module/body_corporate/sectional_title are
// RE-HOMED (not moved): they stay in TIER_FEATURES_FIRM above so an existing residential Firm agency
// keeps "HOAs on the side" (NR-1), AND appear here so the HOA line carries them at its base.
// PROVISIONAL (Phase 3, GTM-confirmable): the HOA tiers differ on CAPACITY (HOA_LIMITS — total units
// under management), NOT on features, so this feature set is FLAT across hoa_studio→hoa_bespoke. Per-tier
// HOA feature differentiation is a product decision deferred to Phase 3. Rental-only features
// (lease_*, tenant_portal, application_pipeline, arrears_automation, fitscore_*) are deliberately absent.
const HOA_FEATURES_BASE = [
  "hoa_module",
  "body_corporate",
  "sectional_title",
  "bank_recon",              // levy reconciliation against the scheme bank feed
  "owner_statements",        // unit-owner levy statements
  "basic_invoicing",         // levy invoicing
  "maintenance_log",         // common-property maintenance
  "inspection_basic",
  "inspection_unlimited",    // common-property inspections
  "ai_maintenance_triage",   // Haiku — triage scheme maintenance
  "ai_inspection",           // Sonnet — common-property condition
  "ai_full",                 // Sonnet — AGM notices, levy justifications
  "reports_basic",
  "reports_full",
  "docuseal_signing",        // AGM notices, levy demand letters
  "sms_notifications",
  "whatsapp_notifications",  // owner comms
  "contractor_portal",       // scheme contractors
  "custom_templates",
  "opus_ai",                 // Opus — CSOS/tribunal submissions
  "property_intelligence",
] as const

export const HOA_TIER_FEATURES: Record<HoaTier, readonly string[]> = {
  hoa_studio:   HOA_FEATURES_BASE,
  hoa_practice: HOA_FEATURES_BASE,
  hoa_firm:     HOA_FEATURES_BASE,
  hoa_bespoke:  HOA_FEATURES_BASE,
}

/** True if `tier` is on the HOA product line (its literal is an HOA-ladder key). */
function isHoaTier(tier: AnyTier): tier is HoaTier {
  return tier in HOA_TIER_ORDER
}

export function hasFeature(tier: AnyTier, feature: string): boolean {
  const features = isHoaTier(tier) ? HOA_TIER_FEATURES[tier] : TIER_FEATURES[tier]
  return features.includes(feature)
}

/**
 * Ordinal tier comparison WITHIN a product line. The residential and HOA ladders are independent, so
 * comparing across lines is meaningless — a cross-line call returns false (deny) rather than compare
 * incomparable ordinals. Callers always hold one org's line, so a cross-line pair is a caller bug.
 */
export function hasAccess(orgTier: AnyTier, requiredTier: AnyTier): boolean {
  if (isHoaTier(orgTier)) {
    if (!isHoaTier(requiredTier)) return false // cross-line — incomparable
    return HOA_TIER_ORDER[orgTier] >= HOA_TIER_ORDER[requiredTier]
  }
  if (isHoaTier(requiredTier)) return false // cross-line — incomparable
  return TIER_ORDER[orgTier] >= TIER_ORDER[requiredTier]
}

/**
 * Minimum tier floor per route PREFIX — the single source the nav AND the route guard (requireRouteTier)
 * both read, so a tier-gated surface can never disagree between sidebar visibility and URL access (Truth
 * Pipeline). Keyed by the route's own prefix (a child path inherits its parent's floor via tierFloorForPath).
 * Distinct from TIER_FEATURES (capability features for hasFeature); this is route access only.
 *   Documents/Trust-account/Data are Steward ("Steward unlocks documents, trust account"); HOA is the Firm
 *   sectional-title module (hoa_module); Calendar + Trust Ledger are Portfolio/Steward views with no feature
 *   key of their own. custom_templates stays a separate (Firm) feature — not the basic Documents settings.
 */
export const ROUTE_TIER_FLOORS = {
  "/calendar":             "portfolio",
  "/finance/trust-ledger": "steward",
  "/hoa":                  "firm",
  "/settings/templates":      "steward",
  "/settings/lease-templates": "steward",
  "/settings/deposits":       "steward",
  "/settings/import":         "steward",
} as const satisfies Record<string, Tier>

/** The tier floor that applies to `path` (longest matching route prefix), or null if the route is untiered. */
export function tierFloorForPath(path: string): Tier | null {
  let floor: Tier | null = null
  let bestLen = -1
  for (const [route, tier] of Object.entries(ROUTE_TIER_FLOORS)) {
    if ((path === route || path.startsWith(route + "/")) && route.length > bestLen) {
      floor = tier
      bestLen = route.length
    }
  }
  return floor
}
