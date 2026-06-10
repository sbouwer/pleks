"use client"

/**
 * components/layout/LandlordPortalShell.tsx — Landlord/owner portal chrome (client)
 *
 * Auth:   none here — the auth guard lives in the server layout (app/(landlord)/landlord/layout.tsx);
 *         this renders only after a landlord session has resolved.
 * Notes:  Interactive shell (mobile-nav state, theme, feedback) for /landlord/*. Split out of the layout so the
 *         layout can be a server component that guards (ADDENDUM_AUTH_HARDENING P-1).
 */

import { useCallback, useState } from "react"
import { LandlordSidebar, LANDLORD_NAV_GROUPS } from "@/components/portal/LandlordSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { FeedbackButton } from "@/components/feedback/FeedbackButton"
import { ConsentGate } from "@/components/legal/ConsentGate"

export function LandlordPortalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <PortalThemeProvider>
      <ConsentGate />
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
      <FeedbackButton role="landlord" />
    </PortalThemeProvider>
  )
}
