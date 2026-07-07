"use client"

/**
 * hooks/useTrustAccount.ts — derives trust-account capability flags from org settings + tier
 *
 * Data:   useOrg() (has_trust_account / has_deposit_account) and useTier()
 * Notes:  Owner tier (personal landlord) does not require a trust account for deposit features
 */
import { useOrg } from "./useOrg"
import { useTier } from "./useTier"

export function useTrustAccount() {
  const { org } = useOrg()
  const { tier } = useTier()

  const hasConfirmedTrustAccount = (org as Record<string, unknown> | null)?.has_trust_account === true
  const hasDepositAccount = (org as Record<string, unknown> | null)?.has_deposit_account === true

  // Owner tier: personal landlord — trust account not required for Pleks features
  const trustAccountRequired = tier !== "owner"

  return {
    hasConfirmedTrustAccount,
    hasDepositAccount,
    trustAccountRequired,
    canUseFullDepositManagement: !trustAccountRequired || hasConfirmedTrustAccount,
    canRecordDeposit: true,
  }
}
