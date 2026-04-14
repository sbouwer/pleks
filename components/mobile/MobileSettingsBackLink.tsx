"use client"

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
