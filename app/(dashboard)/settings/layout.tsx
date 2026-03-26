"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, CreditCard, Shield, Wrench, FileText, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/compliance", label: "Compliance", icon: Shield },
  { href: "/settings/contractors", label: "Contractors", icon: Wrench },
  { href: "/settings/lease-templates", label: "Lease Templates", icon: FileText },
  { href: "/settings/import", label: "Import", icon: Upload },
]

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()

  return (
    <div>
      <h1 className="font-heading text-3xl mb-4">Settings</h1>

      {/* Tab navigation */}
      <div className="border-b border-border mb-6 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/")
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                  active
                    ? "border-brand text-brand font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      {children}
    </div>
  )
}
