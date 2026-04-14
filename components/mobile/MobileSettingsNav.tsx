"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

const SETTINGS_GROUPS = [
  {
    title: "Organisation",
    items: [
      { href: "/settings/profile", label: "Details" },
      { href: "/settings/team", label: "Team" },
      { href: "/settings/hours", label: "Opening hours" },
      { href: "/settings/branding", label: "Branding" },
    ],
  },
  {
    title: "Documents",
    items: [
      { href: "/settings/lease-templates", label: "Lease templates" },
      { href: "/settings/compliance", label: "Compliance" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/settings/finance", label: "Deposits" },
      { href: "/settings/billing", label: "Subscription" },
      { href: "/settings/notifications", label: "Notifications" },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/settings/import", label: "Import" },
    ],
  },
]

export function MobileSettingsNav() {
  return (
    <div className="px-4 pb-20">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-sm text-muted-foreground mb-6 -mt-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to app
      </Link>
      <h1 className="text-xl font-semibold mb-6">Settings</h1>
      <div className="space-y-6">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 px-1">
              {group.title}
            </p>
            <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between px-4 py-3.5 bg-card hover:bg-surface-elevated transition-colors text-sm"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
