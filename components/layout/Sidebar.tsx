"use client"

/**
 * components/layout/Sidebar.tsx — Main navigation sidebar for the agent workspace
 *
 * Auth:   Rendered inside the dashboard layout (gateway-protected)
 * Notes:  Nav items filtered by tier (useTier) and org type (useOrgCapabilities).
 *         /landlords and /hoa hidden for landlord-type orgs (D-61A-04).
 *         Trust Ledger label reflects trustAccountLabel capability (D-61A-07).
 */

import { useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "./SidebarContent"
import { SettingsSidebar } from "./SettingsSidebar"
import { useTier } from "@/hooks/useTier"
import { useNavBadges } from "@/hooks/useNavBadges"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
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
  Receipt,
  BookOpen,
  PieChart,
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
      { href: "/suppliers", label: "Suppliers", icon: HardHat },
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
      { href: "/finance", label: "Overview", icon: PieChart },
      { href: "/finance/deposits", label: "Deposits", icon: Wallet },
      { href: "/finance/trust-ledger", label: "Trust Ledger", icon: BookOpen },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/statements", label: "Statements", icon: Receipt },
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
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { isSteward, isGrowth, isPortfolio, isFirm } = useTier()
  const badges = useNavBadges()
  const caps = useOrgCapabilities()

  // Settings pages get their own dedicated sidebar
  if (pathname.startsWith("/settings")) {
    return (
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border lg:flex">
        <SettingsSidebar />
      </aside>
    )
  }

  const BADGE_COUNTS: Record<string, number> = {
    "/applications": badges.applications,
    "/maintenance": badges.maintenance,
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        // Tier gates
        if (item.href === "/calendar") return isPortfolio || isFirm
        if (item.href === "/finance/trust-ledger") return isSteward || isGrowth || isPortfolio || isFirm
        // Org-type gates — D-61A-04: hide, don't grey-out
        if (item.href === "/landlords" && caps !== null && !caps.hasLandlordsList) return false
        if (item.href === "/hoa" && caps !== null && !caps.hasHOA) return false
        return true
      })
      .map((item) => ({
        ...item,
        // D-61A-07: trust ledger relabelled for landlord-type orgs
        label: item.href === "/finance/trust-ledger" && caps?.trustAccountLabel === "deposits"
          ? "Deposit holdings"
          : item.label,
        count: BADGE_COUNTS[item.href] ?? undefined,
      })),
  })).filter((group) => group.items.length > 0)

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
