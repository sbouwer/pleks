"use client"

/**
 * components/gates/TierGate.tsx — renders children only if the org's tier includes `feature`, else an upgrade fallback
 *
 * Data:   useTier() for the active org tier; hasFeature() maps tier → feature access
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
