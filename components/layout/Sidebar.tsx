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
import { useNavBadges } from "@/hooks/useNavBadges"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
import { trustLedgerNavLabel } from "@/lib/org/capabilities"
import { useNavGate } from "@/hooks/useNavGate"
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  ClipboardCheck,
  Wrench,
  CreditCard,
  BarChart3,
  DoorOpen,
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
      { href: "/listings", label: "Listings", icon: DoorOpen },
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
  const badges = useNavBadges()
  const caps = useOrgCapabilities()
  const canSee = useNavGate()  // shared capability + tier gate (same predicate as mobile) — RBAC P4

  // Settings pages get their own dedicated sidebar
  if (pathname.startsWith("/settings")) {
    return (
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border lg:flex">
        <SettingsSidebar />
      </aside>
    )
  }

  const BADGE_COUNTS: Record<string, number> = {
    "/listings": badges.applications,
    "/maintenance": badges.maintenance,
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        // Capability + tier gate (shared SSOT predicate — desktop + mobile read the same maps)
        if (!canSee(item.href)) return false
        // Org-type gates — D-61A-04: hide, don't grey-out (a separate axis, per-component)
        // FAIL-CLOSED: HOA is standalone (2026-07-10) and off for every residential package, so an
        // unresolved `caps` must HIDE it — not flash it and bounce the agent to /403 on click.
        if (item.href === "/hoa" && !caps?.hasHOA) return false
        if (item.href === "/landlords" && caps !== null && !caps.hasLandlordsList) return false
        // Product-line surface gates (ADDENDUM_18C D-18C-04): the standalone HOA line switches off the
        // whole rental surface — leases, tenants, and the applications/listings funnel.
        if (item.href === "/leases" && caps !== null && !caps.hasLeases) return false
        if (item.href === "/tenants" && caps !== null && !caps.hasTenants) return false
        if (item.href === "/listings" && caps !== null && !caps.hasApplications) return false
        return true
      })
      .map((item) => ({
        ...item,
        // D-61A-07 / ADDENDUM_18C: trust ledger relabelled per trustAccountLabel (deposits → landlord,
        // scheme_funds → HOA line; same D-TRUST-01 posture, display only).
        label: item.href === "/finance/trust-ledger"
          ? trustLedgerNavLabel(caps?.trustAccountLabel, item.label)
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
