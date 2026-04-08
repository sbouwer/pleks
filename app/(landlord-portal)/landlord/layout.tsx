"use client"

import { useCallback, useState } from "react"
import { LandlordSidebar, LANDLORD_NAV_GROUPS } from "@/components/portal/LandlordSidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"

export default function LandlordPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <LandlordSidebar />
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={LANDLORD_NAV_GROUPS}
        homeHref="/landlord/dashboard"
        badge="Owner"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          settingsHref="/landlord/profile"
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  )
}
