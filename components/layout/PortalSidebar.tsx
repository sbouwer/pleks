"use client"

/**
 * components/layout/PortalSidebar.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
} from "lucide-react"

const PORTAL_NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/tenant", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tenant/payments", label: "Payments", icon: CreditCard },
      { href: "/tenant/lease", label: "My Lease", icon: FileText },
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
