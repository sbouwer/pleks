/**
 * app/(public)/public/notice/[token]/page.tsx — anonymous mandatory-notice view
 *
 * Route:  /public/notice/[token]
 * Auth:   public — no session required
 * Data:   delivery_notice_tokens, communication_log, organisations via service client
 * Notes:  Renders the stored body_full for mandatory comms whose primary channel
 *         failed. Page view is recorded as a communication_delivery_events row.
 *         Tenants with a portal account are shown a login prompt instead (§9.5).
 *         BUILD_63 Phase 8 (§7.2).
 */

import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { AlertTriangle, Building2 } from "lucide-react"
import { NoticeAcknowledge } from "./NoticeAcknowledge"
import { recordNoticePageView } from "@/lib/actions/delivery-notice"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface Props {
  params: Promise<{ token: string }>
}

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  "arrears.letter_of_demand":   "Letter of Demand",
  "arrears.final_notice":       "Final Notice — Arrears",
  "deposit.return_schedule":    "Deposit Deduction Schedule",
  "deposit.returned":           "Deposit Refund Notice",
  "inspection.move_in_report":  "Move-In Inspection Report",
  "inspection.dispute_window":  "Move-Out Inspection — Dispute Window",
  "lease.renewal_notice":       "Lease Renewal Notice (CPA s14)",
  "lease.expiry_reminder":      "Lease Expiry Reminder",
  "lease.terminated":           "Lease Termination Notice",
  "maintenance.emergency":      "Emergency / Habitability Notice",
}

const DEADLINE_DAYS: Record<string, number> = {
  "deposit.return_schedule":    21,
  "inspection.dispute_window":   7,
  "arrears.final_notice":        7,
  "arrears.letter_of_demand":   14,
}

function daysRemaining(sentAt: string, templateKey: string): number | null {
  const days = DEADLINE_DAYS[templateKey]
  if (!days) return null
  const deadline = new Date(sentAt).getTime() + days * 86400_000
  return Math.ceil((deadline - Date.now()) / 86400_000)
}

export default async function NoticePage({ params }: Props) {
  const { token } = await params
  const service = getService()

  const { data: row, error: rowError } = await service
    .from("delivery_notice_tokens")
    .select("id, org_id, communication_log_id, expires_at, acknowledged_at, tenant_id")
    .eq("token", token)
    .maybeSingle()
    logQueryError("NoticePage delivery_notice_tokens", rowError)

  if (!row) notFound()
  if (new Date(row.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Link expired</h1>
          <p className="text-sm text-muted-foreground">This notice link has expired. Please contact your property manager for assistance.</p>
        </div>
      </div>
    )
  }

  const [{ data: comm }, { data: org }] = await Promise.all([
    service
      .from("communication_log")
      .select("subject, body_full, template_key, created_at, channel")
      .eq("id", row.communication_log_id)
      .single(),
    service
      .from("organisations")
      .select("name, logo_url, document_brand_colour, document_primary_font")
      .eq("id", row.org_id)
      .single(),
  ])

  if (!comm) notFound()

  void recordNoticePageView(row.id)

  const categoryLabel = CATEGORY_LABELS[comm.template_key as string] ?? "Important Notice"
  const sentDate = new Date(comm.created_at as string).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })
  const remaining = daysRemaining(comm.created_at as string, comm.template_key as string)
  const accentColor = (org?.document_brand_colour as string | null) ?? "#1a3a5c"

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Agency header */}
        <div className="bg-white rounded-xl border px-6 py-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
               style={{ backgroundColor: accentColor }}>
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">{org?.name ?? "Property Manager"}</p>
            <p className="text-xs text-muted-foreground">Managed via Pleks Property Management</p>
          </div>
        </div>

        {/* Notice metadata */}
        <div className="bg-white rounded-xl border px-6 py-5 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{categoryLabel}</p>
              <h1 className="text-base font-semibold">{(comm.subject as string | null) ?? "Important Notice"}</h1>
              <p className="text-xs text-muted-foreground mt-1">Sent {sentDate}</p>
            </div>
            {remaining !== null && remaining > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 text-center shrink-0">
                <p className="font-semibold text-sm">{remaining}</p>
                <p>days remaining</p>
              </div>
            )}
            {remaining !== null && remaining <= 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 shrink-0">
                Deadline passed
              </div>
            )}
          </div>
        </div>

        {/* Notice body */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-3 border-b bg-gray-50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notice content</p>
          </div>
          {comm.body_full ? (
            <iframe
              srcDoc={comm.body_full as string}
              sandbox=""
              className="w-full border-0"
              style={{ height: "600px" }}
              title="Notice content"
            />
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              Notice content not available. Please contact your property manager.
            </div>
          )}
        </div>

        {/* Acknowledge */}
        <div className="bg-white rounded-xl border px-6 py-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            By clicking below you confirm that you have read and received this notice.
            This acknowledgement is time-stamped and recorded for legal purposes.
          </p>
          <NoticeAcknowledge token={token} alreadyAcknowledged={!!row.acknowledged_at} />
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          This is an official notice from your property manager delivered via Pleks.
          If you did not expect this, contact your property manager.
        </p>
      </div>
    </div>
  )
}
