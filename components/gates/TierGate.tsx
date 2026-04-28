"use client"

/**
 * components/gates/TierGate.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useTier } from "@/hooks/useTier"
import { hasFeature } from "@/lib/tier/gates"
import { UpgradeCTA } from "./UpgradeCTA"

interface TierGateProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function TierGate({ feature, children, fallback }: TierGateProps) {
  const { tier, loading } = useTier()

  if (loading) return null

  if (!hasFeature(tier, feature)) {
    return <>{fallback ?? <UpgradeCTA feature={feature} />}</>
  }

  return <>{children}</>
}
