"use client"

/**
 * app/(supplier)/SupplierShell.tsx — Supplier portal client-side shell (sidebar + nav + layout)
 *
 * Route:  /supplier/*
 * Auth:   Parent layout.tsx gates auth; this component is purely presentational
 * Notes:  FeedbackButton mounts here so suppliers can submit feedback from any page.
 */

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "@/components/layout/SidebarContent"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"
import { FeedbackButton } from "@/components/feedback/FeedbackButton"
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  UserCircle,
} from "lucide-react"

const SUPPLIER_NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/supplier", label: "Dashboard", icon: LayoutDashboard },
      { href: "/supplier/jobs", label: "Jobs", icon: Briefcase },
      { href: "/supplier/invoices", label: "Invoices", icon: FileText },
      { href: "/supplier/profile", label: "Profile", icon: UserCircle },
    ],
  },
]

export function SupplierShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <PortalThemeProvider>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border lg:flex transition-all duration-200",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <SidebarContent
          groups={SUPPLIER_NAV_GROUPS}
          homeHref="/supplier"
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          badge="Supplier"
        />
      </aside>
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={SUPPLIER_NAV_GROUPS}
        homeHref="/supplier"
        badge="Supplier"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar settingsHref="/supplier/profile" />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
      <FeedbackButton role="supplier" />
    </PortalThemeProvider>
  )
}
