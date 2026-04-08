"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useTier } from "@/hooks/useTier"

const PAYMENT_TABS = [
  { label: "Payments",        href: "/payments",                  exact: true },
  { label: "Invoices",        href: "/payments/invoices" },
  { label: "Reconciliation",  href: "/payments/reconciliation" },
  { label: "Arrears",         href: "/payments/arrears" },
  { label: "Municipal",       href: "/payments/municipal" },
  { label: "DebiCheck",       href: "/payments/debicheck",        ownerHidden: true },
]

export function PaymentsTabBar() {
  const pathname = usePathname()
  const { isOwner } = useTier()

  const tabs = PAYMENT_TABS.filter((t) => !(t.ownerHidden && isOwner))

  return (
    <div className="border-b border-border mb-6 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
      <nav className="flex gap-1">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + "/")
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                active
                  ? "border-brand text-brand font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
