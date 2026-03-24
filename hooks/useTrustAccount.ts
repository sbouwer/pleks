"use client"

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
