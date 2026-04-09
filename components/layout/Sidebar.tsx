"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "./SidebarContent"
import { useTier } from "@/hooks/useTier"
import { useNavBadges } from "@/hooks/useNavBadges"
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  ClipboardCheck,
  Wrench,
  CreditCard,
  BarChart3,
  UserCheck,
  Landmark,
  Settings,
  Wallet,
  HardHat,
  UserSquare2,
  CalendarDays,
} from "lucide-react"

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/landlords", label: "Landlords", icon: UserSquare2 },
      { href: "/tenants", label: "Tenants", icon: Users },
      { href: "/contractors", label: "Suppliers", icon: HardHat },
      { href: "/leases", label: "Leases", icon: FileText },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/applications", label: "Applications", icon: UserCheck },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/finance/deposits", label: "Deposits", icon: Wallet },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Advanced",
    items: [
      { href: "/hoa", label: "HOA", icon: Landmark },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { isPortfolio, isFirm } = useTier()
  const badges = useNavBadges()

  const BADGE_COUNTS: Record<string, number> = {
    "/applications": badges.applications,
    "/maintenance": badges.maintenance,
  }
  // Arrears lives under Finance → Payments hub, not a direct nav item — skip for now

  // Filter tier-gated nav items, inject action-required counts
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        if (item.href === "/calendar") return isPortfolio || isFirm
        return true
      })
      .map((item) => ({
        ...item,
        count: BADGE_COUNTS[item.href] ?? undefined,
      })),
  }))

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border lg:flex transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <SidebarContent
        groups={groups}
        homeHref="/dashboard"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
    </aside>
  )
}

export { NAV_GROUPS }
