"use client"

/**
 * app/(tenant)/tenant/layout.tsx — Tenant portal root layout
 *
 * Route:  /tenant/*
 * Auth:   Supabase auth + tenant record check (handled by getTenantSession in each page)
 * Notes:  FeedbackButton mounts here so tenants can submit feedback from any portal page.
 */

import { useCallback, useState } from "react"
import { PortalSidebar, PORTAL_NAV_GROUPS } from "@/components/layout/PortalSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { FeedbackButton } from "@/components/feedback/FeedbackButton"
import { ConsentGate } from "@/components/legal/ConsentGate"

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <PortalThemeProvider>
      <ConsentGate />
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
      <FeedbackButton role="tenant" />
    </PortalThemeProvider>
  )
}
