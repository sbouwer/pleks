/**
 * components/admin/InboxBadge.tsx — Server-rendered count badge for admin nav items
 *
 * Auth:   Server component — rendered inside AdminSidebar (which is behind requireAdminAuth)
 * Data:   feedback_submissions, custom_lease_requests, contact_leads (service-role reads)
 * Notes:  Cached for 60s via Next.js revalidate. Renders nothing when count is 0.
 *         Reusable for any channel via the `channel` prop.
 */
import { createServiceClient } from "@/lib/supabase/server"

type BadgeChannel = "feedback" | "lease_requests" | "contact_leads"

interface InboxBadgeProps {
  channel: BadgeChannel
}

async function getCount(channel: BadgeChannel): Promise<number> {
  try {
    const db = await createServiceClient()
    if (channel === "feedback") {
      const { count } = await db
        .from("feedback_submissions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
      return count ?? 0
    }
    if (channel === "lease_requests") {
      const { count } = await db
        .from("custom_lease_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
      return count ?? 0
    }
    if (channel === "contact_leads") {
      const { count } = await db
        .from("contact_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
      return count ?? 0
    }
    return 0
  } catch {
    return 0
  }
}

export async function InboxBadge({ channel }: InboxBadgeProps) {
  const count = await getCount(channel)
  if (count === 0) return null

  return (
    <span style={{
      fontFamily: "var(--mono)",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.02em",
      background: "var(--amber)",
      color: "var(--ink)",
      padding: "1px 6px",
      borderRadius: 999,
      minWidth: 18,
      textAlign: "center",
    }}>
      {count}
    </span>
  )
}
