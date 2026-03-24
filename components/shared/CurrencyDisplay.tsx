"use client"

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
