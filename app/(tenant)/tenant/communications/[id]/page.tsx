/**
 * app/(tenant)/tenant/communications/[id]/page.tsx — single communication detail
 *
 * Route:  /tenant/communications/[id]
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log, communication_delivery_events via service client
 * Notes:  Page visit auto-records a portal_view delivery event (Tribunal evidence).
 *         "I've read this" button is available for mandatory comms with no prior portal view.
 *         BUILD_63 Phase 8 (§9.1).
 */

import { redirect, notFound } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "@/lib/comms/template-registry"
import { recordPortalView } from "@/lib/actions/portal-comms"
import { Badge } from "@/components/ui/badge"
import { Mail, MessageSquare, CheckCircle2, XCircle, AlertTriangle, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { logQueryError } from "@/lib/supabase/logQueryError"

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

  return (
    <div className="max-w-2xl">
      <Link
        href="/tenant/communications"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to communications
      </Link>

      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {(comm.channel as string) === "sms"
                ? <MessageSquare className="h-5 w-5 text-muted-foreground" />
                : <Mail className="h-5 w-5 text-muted-foreground" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="font-semibold text-base">{subject}</h1>
                {mandatory && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Notice
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{templateLabel(comm.template_key as string | null)}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{new Date(comm.created_at as string).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                <span>·</span>
                <span>{statusLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Body preview */}
        {comm.body && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Message</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{comm.body as string}</p>
          </div>
        )}

        {/* Delivery timeline */}
        {(events ?? []).length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Delivery history</p>
            <div className="space-y-2">
              {(events ?? []).map((ev) => {
                const isFail = (ev.event_type as string).includes("bounce") || ev.event_type === "failed" || ev.event_type === "complained"
                return (
                  <div key={ev.id} className="flex items-center gap-3 text-xs">
                    {isFail
                      ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    }
                    <span className="text-foreground">{EVENT_LABELS[ev.event_type as string] ?? ev.event_type}</span>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(ev.occurred_at as string).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}{" "}
                      {new Date(ev.occurred_at as string).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Acknowledgement banner for unread mandatory comms */}
        {mandatory && !hasPortalView && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">This is a mandatory notice</p>
                <p className="text-xs text-amber-700 mt-1">
                  This notice requires your attention. Viewing this page has been recorded for audit purposes.
                  If you have questions, please contact your managing agent.
                </p>
              </div>
            </div>
          </div>
        )}

        {mandatory && hasPortalView && (
          <div className="flex items-center gap-2 text-sm text-green-700 px-1">
            <CheckCircle2 className="h-4 w-4" />
            Notice viewed — your acknowledgement has been recorded.
          </div>
        )}
      </div>
    </div>
  )
}
