"use client"

/**
 * app/(landlord)/landlord/layout.tsx — Landlord/owner portal root layout
 *
 * Route:  /landlord/*
 * Auth:   Supabase auth + landlord record check (getLandlordSession in each page)
 * Notes:  FeedbackButton mounts here so landlords can submit feedback from any portal page.
 */

import { useCallback, useState } from "react"
import { LandlordSidebar, LANDLORD_NAV_GROUPS } from "@/components/portal/LandlordSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { FeedbackButton } from "@/components/feedback/FeedbackButton"

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
      <FeedbackButton role="landlord" />
    </PortalThemeProvider>
  )
}
