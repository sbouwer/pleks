"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "@/components/layout/SidebarContent"
import { LayoutDashboard, Building2, Wrench, FileText, UserCircle } from "lucide-react"

export const LANDLORD_NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/landlord/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/landlord/properties", label: "Properties", icon: Building2 },
      { href: "/landlord/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/landlord/statements", label: "Statements", icon: FileText },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/landlord/profile", label: "Profile", icon: UserCircle },
    ],
  },
]

export function LandlordSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border lg:flex transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <SidebarContent
        groups={LANDLORD_NAV_GROUPS}
        homeHref="/landlord/dashboard"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        badge="Owner"
      />
    </aside>
  )
}
