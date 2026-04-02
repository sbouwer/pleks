"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { SidebarContent, type NavGroup } from "@/components/layout/SidebarContent"
import { Topbar } from "@/components/layout/TopBar"
import { MobileNav } from "@/components/layout/MobileNav"
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  UserCircle,
} from "lucide-react"

const CONTRACTOR_NAV_GROUPS: NavGroup[] = [
  {
    title: "Main",
    items: [
      { href: "/contractor", label: "Dashboard", icon: LayoutDashboard },
      { href: "/contractor/jobs", label: "Jobs", icon: Briefcase },
      { href: "/contractor/invoices", label: "Invoices", icon: FileText },
      { href: "/contractor/profile", label: "Profile", icon: UserCircle },
    ],
  },
]

export function ContractorShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handleOpenChange = useCallback((open: boolean) => setMobileNavOpen(open), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border lg:flex transition-all duration-200",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <SidebarContent
          groups={CONTRACTOR_NAV_GROUPS}
          homeHref="/contractor"
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          badge="Contractor"
        />
      </aside>
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={handleOpenChange}
        groups={CONTRACTOR_NAV_GROUPS}
        homeHref="/contractor"
        badge="Contractor"
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          settingsHref="/contractor/profile"
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  )
}
