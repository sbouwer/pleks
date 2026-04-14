"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, User, Palette, Shield, FileText, Landmark, Bell, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

type OrgType = "landlord" | "sole_prop" | "agency"

interface TopTab {
  href?: string
  label: string
  icon: React.ElementType
  /** If set, this tab is "active" when pathname starts with any of these prefixes */
  groupPrefixes?: string[]
  /** Sub-tabs shown as second row when this group is active */
  subTabs?: { href: string; label: string }[]
}

function getTopTabs(type: OrgType): TopTab[] {
  if (type === "landlord") {
    return [
      { href: "/settings/profile", label: "Your details", icon: User },
      { href: "/settings/branding", label: "Branding", icon: Palette },
      { href: "/settings/compliance", label: "Compliance", icon: Shield },
      { href: "/settings/lease-templates", label: "Lease Templates", icon: FileText },
      {
        label: "Finance",
        icon: Landmark,
        groupPrefixes: ["/settings/finance", "/settings/billing"],
        subTabs: [
          { href: "/settings/finance", label: "Overview" },
          { href: "/settings/billing", label: "Subscription" },
        ],
      },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
      { href: "/settings/import", label: "Import", icon: Upload },
    ]
  }

  // agency / sole_prop
  return [
    {
      label: "Organisation",
      icon: Building2,
      groupPrefixes: ["/settings/profile", "/settings/team", "/settings/hours", "/settings/branding"],
      subTabs: [
        { href: "/settings/profile", label: "Details" },
        { href: "/settings/team", label: "Team" },
        { href: "/settings/hours", label: "Opening Hours" },
        { href: "/settings/branding", label: "Branding" },
      ],
    },
    { href: "/settings/compliance", label: "Compliance", icon: Shield },
    { href: "/settings/lease-templates", label: "Lease Templates", icon: FileText },
    {
      label: "Finance",
      icon: Landmark,
      groupPrefixes: ["/settings/finance", "/settings/billing"],
      subTabs: [
        { href: "/settings/finance", label: "Overview" },
        { href: "/settings/billing", label: "Subscription" },
      ],
    },
    { href: "/settings/notifications", label: "Notifications", icon: Bell },
    { href: "/settings/import", label: "Import", icon: Upload },
  ]
}

function isTabActive(tab: TopTab, pathname: string): boolean {
  if (tab.groupPrefixes) {
    return tab.groupPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
  }
  if (tab.href) {
    return pathname === tab.href || pathname.startsWith(tab.href + "/")
  }
  return false
}

export function SettingsNav({ orgType }: Readonly<{ orgType: OrgType }>) {
  const pathname = usePathname()
  const tabs = getTopTabs(orgType)

  const activeGroup = tabs.find((t) => t.subTabs && isTabActive(t, pathname))
  const subTabs = activeGroup?.subTabs ?? []

  return (
    <div className="border-b border-border mb-6 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
      {/* Row 1 — top-level tabs */}
      <nav className="flex gap-1">
        {tabs.map((tab) => {
          const active = isTabActive(tab, pathname)
          const href = tab.href ?? tab.subTabs?.[0]?.href ?? "#"
          return (
            <Link
              key={tab.label}
              href={href}
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

      {/* Row 2 — contextual sub-tabs (only when inside a group) */}
      {subTabs.length > 0 && (
        <nav className="flex gap-1 pl-4">
          {subTabs.map((sub) => {
            const active = pathname === sub.href || pathname.startsWith(sub.href + "/")
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={cn(
                  "flex items-center px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors",
                  active
                    ? "border-brand text-brand font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {sub.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
