"use client"

/**
 * components/auth/TeamSessionsView.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Monitor, Smartphone, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface TeamMemberActivity {
  userId: string
  fullName: string | null
  email: string | null
  lastEvent: string | null
  lastEventType: string | null
  lastDeviceLabel: string | null
}

interface Props {
  readonly orgId: string
}

function deviceIcon(label: string | null) {
  const l = (label ?? "").toLowerCase()
  if (l.includes("iphone") || l.includes("android") || l.includes("mobile")) {
    return <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
}

export function TeamSessionsView({ orgId }: Props) {
  const [members, setMembers] = useState<TeamMemberActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      // Get org members
      const { data: orgMembers, error: membersErr } = await supabase
        .from("user_orgs")
        .select("user_id, user_profiles(full_name)")
        .eq("org_id", orgId)
        .is("deleted_at", null)

      if (membersErr || !orgMembers) { setLoading(false); return }

      const userIds = orgMembers.map(m => m.user_id)

      // Get latest auth event per user
      const { data: events, error: eventsError } = await supabase
        .from("auth_events")
        .select("user_id, event_type, device_label, created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        logQueryError("load auth_events", eventsError)

      type AuthEventRow = { user_id: string; event_type: string; device_label: string | null; created_at: string }
      const latestByUser = new Map<string, AuthEventRow>()
      for (const ev of (events ?? []) as AuthEventRow[]) {
        if (!latestByUser.has(ev.user_id)) latestByUser.set(ev.user_id, ev)
      }

      const result: TeamMemberActivity[] = orgMembers.map(m => {
        const latest = latestByUser.get(m.user_id)
        const profile = m.user_profiles as unknown as { full_name: string | null } | null
        return {
          userId: m.user_id,
          fullName: profile?.full_name ?? null,
          email: null,
          lastEvent: latest?.created_at ?? null,
          lastEventType: latest?.event_type ?? null,
          lastDeviceLabel: latest?.device_label ?? null,
        }
      })

      setMembers(result)
      setLoading(false)
    }

    load()
  }, [orgId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Team sessions</h1>
        <p className="text-sm text-muted-foreground">
          Recent sign-in activity for your organisation.
        </p>
      </div>

      <div className="rounded-lg border border-rule bg-surface-raised divide-y divide-rule">
        {members.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">No team members found.</div>
        )}
        {members.map(member => (
          <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
            {deviceIcon(member.lastDeviceLabel)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {member.fullName ?? member.email ?? member.userId.slice(0, 8)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {member.lastEventType
                  ? member.lastEventType.replaceAll("_", " ")
                  : "No activity recorded"}
                {member.lastDeviceLabel && ` · ${member.lastDeviceLabel}`}
              </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {member.lastEvent
                ? formatDistanceToNow(new Date(member.lastEvent), { addSuffix: true })
                : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
