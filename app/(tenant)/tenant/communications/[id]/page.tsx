/**
 * app/(tenant)/tenant/communications/[id]/page.tsx — single communication detail
 *
 * Route:  /tenant/communications/[id]
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log, communication_delivery_events via service client
 * Notes:  Page visit auto-records a portal_view delivery event (Tribunal evidence). Mandatory comms show a
 *         "Notice" badge + acknowledgement banner. BUILD_63 Phase 8 (§9.1). Canon DetailPageLayout + DetailCard.
 */

import { redirect, notFound } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "@/lib/comms/template-registry"
import { recordPortalView } from "@/lib/actions/portal-comms"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA, fmtZA } from "@/lib/dates"

function isTemplateMandatory(key: string | null): boolean {
  if (!key) return false
  try { return getTemplate(key).is_mandatory ?? false } catch { return false }
}

function templateLabel(key: string | null): string {
  if (!key) return "Communication"
  try { return getTemplate(key).description ?? key } catch { return key }
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed", logged: "Logged",
}

const EVENT_LABELS: Record<string, string> = {
  queued: "Queued", sent: "Sent to provider", delivered: "Delivered",
  opened: "Opened", clicked: "Link clicked", bounced_hard: "Hard bounce",
  bounced_soft: "Soft bounce", complained: "Spam report", unsubscribed: "Unsubscribed",
  failed: "Failed", page_view: "Viewed online", portal_view: "Viewed in portal",
}

function commStatus(status: string, label: string): DetailStatus {
  if (status === "failed") return { kind: "flag", label }
  if (status === "delivered" || status === "read") return { kind: "occupied", label }
  return { kind: "neutral", label }
}

export default async function CommDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()

  const { data: comm, error } = await service
    .from("communication_log")
    .select("id, org_id, template_key, subject, channel, status, created_at, body, body_full, direction, tone_variant, attempt_number")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .single()

  if (error || !comm) notFound()

  // Fetch delivery events for timeline
  const { data: events, error: eventsError } = await service
    .from("communication_delivery_events")
    .select("id, event_type, provider, occurred_at")
    .eq("communication_log_id", id)
    .order("occurred_at", { ascending: true })
    logQueryError("CommDetailPage communication_delivery_events", eventsError)

  const hasPortalView = (events ?? []).some((e) => e.event_type === "portal_view")
  const mandatory = isTemplateMandatory(comm.template_key as string | null)

  // Auto-record portal_view — fire and forget, not awaited to avoid blocking render
  void recordPortalView(id)

  const subject = (comm.subject as string | null) ?? templateLabel(comm.template_key as string | null)
  const statusLabel = STATUS_LABELS[(comm.status as string) ?? ""] ?? (comm.status as string) ?? "Unknown"

  const facts: DetailFact[] = [
    { k: "Channel", v: (comm.channel as string) === "sms" ? "SMS" : "Email" },
    { k: "Type", v: templateLabel(comm.template_key as string | null) },
    { k: "Date", v: fmtDateLongZA(comm.created_at as string) },
  ]

  return (
    <DetailPageLayout
      category="Communications"
      backHref="/tenant/communications"
      title={subject}
      status={commStatus(comm.status as string, statusLabel)}
      badge={mandatory ? (
        <span className="inline-flex items-center gap-1 rounded-[var(--r-button)] border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-warning">
          <AlertTriangle className="h-3 w-3" />
          Notice
        </span>
      ) : undefined}
      facts={facts}
    >
      {comm.body && (
        <DetailFullWidth>
          <DetailCard title="Message">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{comm.body as string}</p>
          </DetailCard>
        </DetailFullWidth>
      )}

      {(events ?? []).length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Delivery history">
            <div className="space-y-2">
              {(events ?? []).map((ev) => {
                const isFail = (ev.event_type as string).includes("bounce") || ev.event_type === "failed" || ev.event_type === "complained"
                return (
                  <div key={ev.id} className="flex items-center gap-3 text-xs">
                    {isFail
                      ? <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    }
                    <span className="text-foreground">{EVENT_LABELS[ev.event_type as string] ?? ev.event_type}</span>
                    <span className="ml-auto text-muted-foreground">
                      {fmtZA(ev.occurred_at as string, { hour: "2-digit", minute: "2-digit" })}{" "}
                      {fmtZA(ev.occurred_at as string, { day: "numeric", month: "short" })}
                    </span>
                  </div>
                )
              })}
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}

      {mandatory && !hasPortalView && (
        <DetailFullWidth>
          <div className="rounded-[var(--r-button)] border border-warning/30 bg-warning/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-semibold text-foreground">This is a mandatory notice</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This notice requires your attention. Viewing this page has been recorded for audit purposes.
                  If you have questions, please contact your managing agent.
                </p>
              </div>
            </div>
          </div>
        </DetailFullWidth>
      )}

      {mandatory && hasPortalView && (
        <DetailFullWidth>
          <div className="flex items-center gap-2 px-1 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Notice viewed — your acknowledgement has been recorded.
          </div>
        </DetailFullWidth>
      )}
    </DetailPageLayout>
  )
}
