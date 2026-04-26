/**
 * Derives insurance checklist capability flags from the org tier.
 *
 * Owner free:  read-only; upgrade CTA shown inline
 * Steward+:    full inline ticking, N/A marking, broker brief, owner link
 */

export type OrgTier = "owner_free" | "owner_pro" | "steward" | "firm"

export interface ChecklistPermissions {
  canTick:           boolean
  canMarkNA:         boolean
  canSendBrokerBrief: boolean
  canSendOwnerLink:  boolean
}

export function useChecklistPermissions(tier: OrgTier): ChecklistPermissions {
  const isStewardPlus = tier === "steward" || tier === "firm"
  const isOwnerPro    = tier === "owner_pro"

  return {
    canTick:            isStewardPlus || isOwnerPro,
    canMarkNA:          isStewardPlus || isOwnerPro,
    canSendBrokerBrief: isStewardPlus,
    canSendOwnerLink:   isStewardPlus,
  }
}
