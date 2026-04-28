"use client"

/**
 * hooks/useTrustAccount.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
