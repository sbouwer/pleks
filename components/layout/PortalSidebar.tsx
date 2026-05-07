"use client"

/**
 * components/layout/PortalSidebar.tsx — tenant portal sidebar navigation
 *
 * Auth:   tenant portal session (rendered inside the tenant layout)
 * Notes:  BUILD_63 Phase 8: Communications added to Main nav group.
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "./SidebarContent"
import {
  LayoutDashboard,
  CreditCard,
  FileText,
  Wrench,
  UserCircle,
  MessageSquare,
} from "lucide-react"

const PORTAL_NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/tenant", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tenant/payments", label: "Payments", icon: CreditCard },
      { href: "/tenant/lease", label: "My Lease", icon: FileText },
      { href: "/tenant/communications", label: "Communications", icon: MessageSquare },
    ],
  },
  {
    title: "Services",
    items: [
      { href: "/tenant/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/tenant/account", label: "Account", icon: UserCircle },
    ],
  },
]

export function PortalSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border lg:flex transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <SidebarContent
        groups={PORTAL_NAV_GROUPS}
        homeHref="/tenant"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        badge="Tenant"
      />
    </aside>
  )
}

export { PORTAL_NAV_GROUPS }
