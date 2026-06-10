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
import { useCapabilities } from "@/components/auth/CapabilitiesProvider"
import { tierFloorForPath, hasAccess } from "@/lib/tier/gates"
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

// href → required capability (RBAC P4 nav visibility). Unlisted items are ungated (Dashboard, Settings,
// Calendar/HOA keep their own tier/org-type gates). Owner/is_admin hold every capability.
const NAV_CAPABILITY: Record<string, string> = {
  "/properties": "properties",
  "/landlords": "landlords",
  "/tenants": "tenants",
  "/suppliers": "maintenance",
  "/leases": "leases",
  "/applications": "applications",
  "/maintenance": "maintenance",
  "/inspections": "inspections",
  "/finance": "finance",
  "/finance/deposits": "finance",
  "/finance/trust-ledger": "finance",
  "/billing": "billing",
  "/statements": "finance",
  "/reports": "reports",
  "/hoa": "properties",
}

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
  const { tier } = useTier()
  const badges = useNavBadges()
  const caps = useOrgCapabilities()
  const { has } = useCapabilities()  // hide nav items the member lacks the capability for (RBAC P4)

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
        // Capability gate (RBAC P4) — hide items the member lacks the capability for
        const reqCap = NAV_CAPABILITY[item.href]
        if (reqCap && !has(reqCap)) return false
        // Tier floor (SSOT — ROUTE_TIER_FLOORS; same source the route guard reads, so nav + URL never split)
        const floor = tierFloorForPath(item.href)
        if (floor && !hasAccess(tier, floor)) return false
        // Org-type gates — D-61A-04: hide, don't grey-out
        if (item.href === "/hoa" && caps !== null && !caps.hasHOA) return false
        if (item.href === "/landlords" && caps !== null && !caps.hasLandlordsList) return false
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
