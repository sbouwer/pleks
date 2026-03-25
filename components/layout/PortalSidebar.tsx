"use client"

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
      { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
      { href: "/portal/payments", label: "Payments", icon: CreditCard },
      { href: "/portal/lease", label: "My Lease", icon: FileText },
    ],
  },
  {
    title: "Services",
    items: [
      { href: "/portal/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/portal/account", label: "Account", icon: UserCircle },
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
        homeHref="/portal"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        badge="Tenant"
      />
    </aside>
  )
}

export { PORTAL_NAV_GROUPS }
