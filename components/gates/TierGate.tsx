"use client"

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
