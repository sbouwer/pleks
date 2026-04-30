/**
 * components/admin/ExportNotificationBadge.tsx — Server component for completed audit exports
 *
 * Auth:   Server component — rendered inside admin sidebar (behind requireAdminAuth)
 * Data:   audit_exports (service-role read — recently completed, not yet downloaded)
 */
import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"

export async function ExportNotificationBadge({ adminEmail }: { adminEmail: string }) {
  const db = await createServiceClient()
  const { data } = await db
    .from("audit_exports")
    .select("id, signed_url, row_count, completed_at, filter_params")
    .eq("requested_by", adminEmail)
    .eq("status", "completed")
    .is("notification_sent_at", null)
    .order("completed_at", { ascending: false })
    .limit(5)

  const count = (data ?? []).length
  if (count === 0) return null

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <Link
        href="/admin/audit"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--ink-soft)",
          padding: "4px 10px",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--rule-strong)",
          background: "var(--amber-wash)",
          textDecoration: "none",
        }}
        title={`${count} export${count === 1 ? "" : "s"} ready`}
      >
        <span style={{ color: "var(--amber-ink)", fontWeight: 600 }}>↓</span>
        {count} export{count === 1 ? "" : "s"} ready
      </Link>
    </div>
  )
}
