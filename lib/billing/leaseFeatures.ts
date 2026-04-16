export type LeasePremiumFeature =
  | "whatsapp"
  | "document_editor"
  | "ai_welcome_pack"
  | "fitscore"
  | "custom_lease_upload"
  | "automated_s14"
  | "inspection_report_full"

export const PREMIUM_FEATURE_LABELS: Record<LeasePremiumFeature, string> = {
  whatsapp:               "WhatsApp notifications",
  document_editor:        "Document editor",
  ai_welcome_pack:        "AI welcome pack",
  fitscore:               "FitScore screening",
  custom_lease_upload:    "Custom lease upload",
  automated_s14:          "Automated escalation notices",
  inspection_report_full: "Full inspection report",
}

/**
 * Returns true if the given lease can use the given premium feature.
 *
 * Rules:
 * - Frozen subscription → no premium features.
 * - Steward/Portfolio/Firm → all features on all leases.
 * - Owner tier → only leases with premium_enabled = true.
 */
export function canUseLeaseFeature(
  lease: { premium_enabled: boolean; org_tier?: string | null },
  feature: LeasePremiumFeature,
  subscriptionStatus?: string | null,
): boolean {
  // Frozen accounts lose all premium features
  if (subscriptionStatus === "frozen") return false
  // All paid tiers have premium features on all leases (no per-lease billing)
  if (["steward", "portfolio", "firm"].includes(lease.org_tier ?? "")) return true
  // Owner tier: only premium-enabled leases unlock the features
  return lease.premium_enabled === true
}
