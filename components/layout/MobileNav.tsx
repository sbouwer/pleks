"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  FileText,
  ClipboardCheck,
  Wrench,
  CreditCard,
  BarChart3,
  Settings,
} from "lucide-react"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/units", label: "Units", icon: DoorOpen },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/leases", label: "Leases", icon: FileText },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
]

interface MobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 bg-sidebar p-0">
        <SheetHeader className="p-6">
          <SheetTitle className="font-heading text-2xl font-bold text-brand">
            Pleks
          </SheetTitle>
        </SheetHeader>
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
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
      </SheetContent>
    </Sheet>
  )
}
