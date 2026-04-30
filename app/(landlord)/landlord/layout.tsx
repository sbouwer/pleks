"use client"

/**
 * app/(landlord)/landlord/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useCallback, useState } from "react"
import { LandlordSidebar, LANDLORD_NAV_GROUPS } from "@/components/portal/LandlordSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"

export default function LandlordPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <PortalThemeProvider>
      <LandlordSidebar />
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={LANDLORD_NAV_GROUPS}
        homeHref="/landlord/dashboard"
        badge="Owner"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar settingsHref="/landlord/profile" />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </PortalThemeProvider>
  )
}
