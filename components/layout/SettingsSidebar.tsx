"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"

type OrgType = "landlord" | "other"

interface SettingsItem {
  href: string
  label: string
  /** Additional path prefixes that also activate this item */
  extraPrefixes?: string[]
}

interface SettingsGroup {
  title: string
  items: SettingsItem[]
}

function getGroups(orgType: OrgType): SettingsGroup[] {
  const hasTeam = orgType !== "landlord"
  return [
    {
      title: "Organisation",
      items: [
        { href: "/settings/profile",  label: "Details" },
        ...(hasTeam ? [
          { href: "/settings/team",   label: "Team" },
          { href: "/settings/hours",  label: "Opening hours" },
        ] : []),
        { href: "/settings/branding", label: "Branding" },
      ],
    },
    {
      title: "Documents",
      items: [
        { href: "/settings/lease-templates", label: "Lease templates" },
      ],
    },
    {
      title: "Compliance",
      items: [
        { href: "/settings/compliance", label: "Compliance" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/settings/finance",      label: "Deposits" },
        { href: "/settings/billing",      label: "Subscription" },
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
}

export function SettingsSidebar() {
  const pathname  = usePathname()
  const { orgId } = useOrg()
  const [orgType, setOrgType] = useState<OrgType>("other")

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("organisations")
      .select("type, user_type")
      .eq("id", orgId)
      .single()
      .then(({ data }) => {
        if (data?.type === "landlord" || data?.user_type === "owner") {
          setOrgType("landlord")
        }
      })
  }, [orgId])

  const groups = getGroups(orgType)

  function isActive(item: SettingsItem) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true
    return item.extraPrefixes?.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    ) ?? false
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo bar — matches main sidebar height */}
      <div className="flex h-16 shrink-0 items-center border-b border-border/50 px-4">
        <Link href="/dashboard">
          <Image src="/logo.svg" alt="Pleks" width={90} height={26} className="h-7 w-auto" priority />
        </Link>
      </div>

      {/* Back link + heading */}
      <div className="px-3 pb-2 pt-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to app
        </Link>
        <p className="mt-3 text-base font-semibold text-foreground">Settings</p>
      </div>

      {/* Settings nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-lg py-1.5 pl-5 pr-3 text-sm transition-colors",
                        active
                          ? "font-medium text-brand bg-brand/10"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
