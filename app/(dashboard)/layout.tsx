"use client"

/**
 * app/(dashboard)/layout.tsx — Agent/admin dashboard root layout
 *
 * Route:  /dashboard/* and /settings/*
 * Auth:   gateway (redirects to /login if not authenticated)
 * Notes:  FeedbackButton mounts here so it renders across all dashboard pages.
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
import { FeedbackButton } from "@/components/feedback/FeedbackButton"

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
      <FeedbackButton role="agent" />
    </PortalThemeProvider>
  )
}
