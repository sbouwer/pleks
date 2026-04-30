"use client"

/**
 * components/mobile/MobileSettingsBackLink.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { usePathname } from "next/navigation"

export function MobileSettingsBackLink() {
  const pathname = usePathname()
  // Don't show at /settings root — MobileSettingsNav has its own back link
  if (pathname === "/settings") return null
  return (
    <Link
      href="/settings"
      className="lg:hidden flex items-center gap-1 text-sm text-muted-foreground mb-4"
    >
      <ChevronLeft className="h-4 w-4" />
      Settings
    </Link>
  )
}
