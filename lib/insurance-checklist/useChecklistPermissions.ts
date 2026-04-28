/**
 * Derives insurance checklist capability flags from the org tier.
 *
 * Owner free:  read-only; upgrade CTA shown inline
 * Steward+:    full inline ticking, N/A marking, broker brief, owner link
 */

export type OrgTier = "owner" | "steward" | "growth" | "portfolio" | "firm" | "bespoke"

export interface ChecklistPermissions {
  canTick:           boolean
  canMarkNA:         boolean
  canSendBrokerBrief: boolean
  canSendOwnerLink:  boolean
}

export function useChecklistPermissions(tier: OrgTier): ChecklistPermissions {
  const isPaid = tier !== "owner"
  return {
    canTick:            isPaid,
    canMarkNA:          isPaid,
    canSendBrokerBrief: isPaid,
    canSendOwnerLink:   isPaid,
  }
}
