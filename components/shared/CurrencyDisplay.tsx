"use client"

/**
 * components/shared/CurrencyDisplay.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { formatZAR } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface CurrencyDisplayProps {
  cents: number
  showCents?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

export function CurrencyDisplay({
  cents,
  showCents = false,
  size = "md",
  className,
}: CurrencyDisplayProps) {
  const sizeStyles = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl font-heading",
  }

  return (
    <span className={cn(sizeStyles[size], className)}>
      {formatZAR(cents, showCents)}
    </span>
  )
}
