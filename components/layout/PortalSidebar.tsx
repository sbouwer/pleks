"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  CreditCard,
  FileText,
  Wrench,
  UserCircle,
} from "lucide-react"

const portalNavItems = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/payments", label: "Payments", icon: CreditCard },
  { href: "/portal/lease", label: "My Lease", icon: FileText },
  { href: "/portal/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/portal/account", label: "Account", icon: UserCircle },
]

export function PortalSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r border-border bg-sidebar h-full">
      <div className="p-6">
        <Link href="/portal" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Pleks" width={100} height={28} />
          <span className="text-xs text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded">
            Tenant
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {portalNavItems.map((item) => {
          const isActive =
            item.href === "/portal"
              ? pathname === "/portal"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
