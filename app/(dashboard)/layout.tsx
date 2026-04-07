"use client"

import { useCallback, useState } from "react"
import { Sidebar, NAV_GROUPS } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { InactivityGuard } from "@/components/layout/InactivityGuard"
import { NavigationProgress } from "@/components/layout/NavigationProgress"
import { PortfolioPrefetcher } from "@/components/providers/PortfolioPrefetcher"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <NavigationProgress />
      <PortfolioPrefetcher />
      <Sidebar />
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={NAV_GROUPS}
        homeHref="/dashboard"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
        <InactivityGuard />
      </div>
    </div>
  )
}
