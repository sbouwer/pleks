"use client"

/**
 * components/layout/SettingsSidebar.tsx — Settings navigation sidebar
 *
 * Route:  /settings/*
 * Auth:   Rendered inside the dashboard layout (gateway-protected)
 * Data:   org type from organisations table to show/hide team-related items
 * Notes:  Feedback item (admin-only) resolves visibility via user_orgs role check.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { AccentBracket } from "@/components/ui/AccentBracket"
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
  adminOnly?: boolean
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
        { href: "/settings/details",         label: "Details" },
        ...(hasTeam ? [
          { href: "/settings/team",         label: "Team" },
          { href: "/settings/hours",        label: "Opening hours" },
        ] : []),
        { href: "/settings/branding",       label: "Branding" },
        { href: "/settings/configuration",  label: "Configuration" },
      ],
    },
    {
      title: "Documents",
      items: [
        { href: "/settings/documents/templates", label: "Templates", extraPrefixes: ["/settings/documents"] },
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
        { href: "/settings/deposits",       label: "Deposits" },
        { href: "/settings/subscription",   label: "Subscription" },
        { href: "/settings/notifications",  label: "Notifications" },
        { href: "/settings/feedback",       label: "Feedback inbox", adminOnly: true },
        { href: "/settings/my-feedback",    label: "My feedback" },
      ],
    },
    {
      title: "Data",
      items: [
        { href: "/settings/import", label: "Import" },
      ],
    },
    {
      title: "My Profile",
      items: [
        { href: "/settings/profile",           label: "Profile" },
        { href: "/settings/profile/signature", label: "Signature", extraPrefixes: [] },
      ],
    },
  ]
}

export function SettingsSidebar() {
  const pathname  = usePathname()
  const { orgId } = useOrg()
  const [orgType, setOrgType] = useState<OrgType>("other")
  const [isAdmin,  setIsAdmin]  = useState(false)

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
    // Resolve org admin status to show feedback inbox link
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("user_orgs")
        .select("role, is_admin")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle()
        .then(({ data: membership }) => {
          if (!membership) return
          const m = membership as { role: string; is_admin: boolean }
          setIsAdmin(m.role === "owner" || m.role === "admin" || m.is_admin === true)
        })
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
        <Link href="/dashboard" className="pub-wordmark" style={{ fontSize: 20 }} aria-label="Pleks">
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
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
              {group.items.filter((item) => !item.adminOnly || isAdmin).map((item) => {
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
