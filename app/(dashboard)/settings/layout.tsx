"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Users, CreditCard, User, Building2, Palette, Shield, FileText, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

type OrgType = "landlord" | "sole_prop" | "agency"

function getSettingsTabs(type: OrgType) {
  const isPersonal = type === "landlord" || type === "sole_prop"
  const showTeam   = type !== "landlord"
  const showImport = type !== "landlord"

  const tabs = [
    {
      href: "/settings/profile",
      label: isPersonal ? "Your details" : "Organisation",
      icon: isPersonal ? User : Building2,
      show: true,
    },
    {
      href: "/settings/team",
      label: type === "sole_prop" ? "Users" : "Team",
      icon: Users,
      show: showTeam,
    },
    {
      href: "/settings/branding",
      label: "Branding",
      icon: Palette,
      show: true,
    },
    {
      href: "/settings/compliance",
      label: "Compliance",
      icon: Shield,
      show: true,
    },
    {
      href: "/settings/lease-templates",
      label: "Lease Templates",
      icon: FileText,
      show: true,
    },
    {
      href: "/settings/billing",
      label: "Billing",
      icon: CreditCard,
      show: true,
    },
    {
      href: "/settings/import",
      label: "Import",
      icon: Upload,
      show: showImport,
    },
  ]

  return tabs.filter((t) => t.show)
}

// Fallback tabs while loading (show all, avoids layout shift)
const FALLBACK_TABS = getSettingsTabs("agency")

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const [tabs, setTabs] = useState(FALLBACK_TABS)

  useEffect(() => {
    fetch("/api/org/details")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.type) setTabs(getSettingsTabs(data.type as OrgType))
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <h1 className="font-heading text-3xl mb-4">Settings</h1>

      <div className="border-b border-border mb-6 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
        <nav className="flex gap-1">
          {tabs.map((tab) => {
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

      {children}
    </div>
  )
}
