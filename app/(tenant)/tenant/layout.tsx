"use client"

import { useCallback, useState } from "react"
import { PortalSidebar, PORTAL_NAV_GROUPS } from "@/components/layout/PortalSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <PortalThemeProvider>
      <PortalSidebar />
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={PORTAL_NAV_GROUPS}
        homeHref="/tenant"
        badge="Tenant"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar settingsHref="/tenant/account" />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </PortalThemeProvider>
  )
}
