"use client"

/**
 * components/layout/TenantPortalShell.tsx — Tenant portal chrome (client)
 *
 * Auth:   none here — the auth guard lives in the server layout (app/(tenant)/tenant/layout.tsx);
 *         this renders only after a tenant session has resolved.
 * Notes:  Interactive shell (mobile-nav state, theme, feedback) for /tenant/*. Split out of the layout so the
 *         layout can be a server component that guards (ADDENDUM_AUTH_HARDENING P-1).
 */

import { useCallback, useState } from "react"
import { PortalSidebar, PORTAL_NAV_GROUPS } from "@/components/layout/PortalSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { FeedbackButton } from "@/components/feedback/FeedbackButton"
import { ConsentGate } from "@/components/legal/ConsentGate"

export function TenantPortalShell({ children }: Readonly<{ children: React.ReactNode }>) {
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
