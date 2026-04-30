"use client"

/**
 * app/(dashboard)/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/TopBar"
import { MobileBottomBar } from "@/components/layout/MobileBottomBar"
import { InactivityGuard } from "@/components/layout/InactivityGuard"
import { NavigationProgress } from "@/components/layout/NavigationProgress"
import { PortfolioPrefetcher } from "@/components/providers/PortfolioPrefetcher"
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts"
import { SyncEngineClient } from "@/components/layout/SyncEngineClient"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { MfaGuard } from "@/components/auth/MfaGuard"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <PortalThemeProvider>
      <MfaGuard />
      <NavigationProgress />
      <PortfolioPrefetcher />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6 pb-16 lg:pb-6">{children}</main>
        <MobileBottomBar />
        <InactivityGuard />
        <KeyboardShortcuts />
        <SyncEngineClient />
      </div>
    </PortalThemeProvider>
  )
}
