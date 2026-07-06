"use client"

/**
 * components/mobile/MobileSettingsNav.tsx — Mobile settings navigation list
 *
 * Route:  /settings (mobile)
 * Auth:   Rendered inside the dashboard layout (gateway-protected)
 * Notes:  Mirrors SettingsSidebar.tsx filtering — team/hours/compliance hidden for
 *         landlord-type orgs via useOrgCapabilities() (D-61A-04). Group structure and
 *         admin gating kept in sync with SettingsSidebar.tsx.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { useOrgCapabilities } from "@/hooks/useOrgCapabilities"
import { useNavGate } from "@/hooks/useNavGate"

export function MobileSettingsNav() {
  const { orgId } = useOrg()
  const caps = useOrgCapabilities()
  const canSee = useNavGate()  // shared capability + tier gate (same predicate as desktop) — RBAC P4
  // ADDENDUM_18C: the /settings account surface relabels per trust framing (same D-TRUST-01 posture).
  let depositLabel = "Trust account"
  if (caps?.trustAccountLabel === "deposits") depositLabel = "Deposits"
  else if (caps?.trustAccountLabel === "scheme_funds") depositLabel = "Scheme funds"
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
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
          setIsAdmin(m.role === "owner" || m.is_admin === true)
        })
    })
  }, [orgId])

  const SETTINGS_GROUPS = [
    {
      title: "Organisation",
      items: [
        { href: "/settings/details?tab=details", label: "Details" },
        ...((caps === null || caps.hasTeam) ? [{ href: "/settings/team", label: "Team" }] : []),
        ...((caps === null || caps.hasOpeningHours) ? [
          { href: "/settings/details?tab=hours", label: "Availability" },
        ] : []),
        { href: "/settings/details?tab=branding", label: "Branding" },
        { href: "/settings/details?tab=configuration", label: "Configuration" },
      ],
    },
    {
      title: "Templates",
      items: [
        { href: "/settings/templates", label: "Templates" },
        { href: "/settings/templates?tab=leases", label: "Lease templates" },
      ],
    },
    ...((caps === null || caps.hasCompliance) ? [{
      title: "Compliance",
      items: [{ href: "/settings/compliance", label: "Compliance" }],
    }] : []),
    {
      title: "Account",
      items: [
        { href: "/settings/deposits", label: depositLabel },
        { href: "/settings/subscription", label: "Subscription" },
        { href: "/settings/notifications", label: "Notifications" },
        ...(isAdmin ? [{ href: "/settings/feedback", label: "Feedback inbox" }] : []),
        { href: "/settings/my-feedback", label: "My feedback" },
      ],
    },
    {
      title: "Data",
      items: [{ href: "/settings/import", label: "Import" }],
    },
    {
      title: "My profile",
      items: [
        { href: "/settings/profile", label: "Profile" },
        { href: "/settings/profile?tab=signature", label: "Signature" },
      ],
    },
  ]
    // Capability + tier — the SAME shared predicate the desktop nav uses (one map, no mobile copy).
    .map((group) => ({
      ...group,
      items: group.items.filter((it) => canSee(it.href)),
    }))
    .filter((group) => group.items.length > 0)

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
