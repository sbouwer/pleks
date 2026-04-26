"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const PAYMENT_TABS = [
  { label: "Payments",        href: "/billing",                  exact: true },
  { label: "Invoices",        href: "/billing/invoices" },
  { label: "Reconciliation",  href: "/billing/reconciliation" },
  { label: "Arrears",         href: "/billing/arrears" },
  { label: "Municipal",       href: "/billing/municipal" },
]

export function BillingTabBar() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border mb-6 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
      <nav className="flex gap-1">
        {PAYMENT_TABS.map((tab) => {
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
