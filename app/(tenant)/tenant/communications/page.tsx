/**
 * app/(tenant)/tenant/communications/page.tsx — tenant communication history
 *
 * Route:  /tenant/communications
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log via service client, filtered by tenant_id
 * Notes:  BUILD_63 Phase 8 (§9.1). Mandatory comms show a "Notice" chip and link to the detail page.
 *         Canon ResourcePageHeader + ListCard rows / EmptyResourceState (door style) — presentation only.
 */

import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ListCard } from "@/components/ui/resource-list"
import { getTemplate } from "@/lib/comms/template-registry"
import { Mail, MessageSquare, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { fmtDateZA } from "@/lib/dates"

function isTemplateMandatory(templateKey: string | null): boolean {
  if (!templateKey) return false
  try {
    return getTemplate(templateKey).is_mandatory ?? false
  } catch {
    return false
  }
}

function templateLabel(templateKey: string | null): string {
  if (!templateKey) return "Communication"
  try {
    const t = getTemplate(templateKey)
    return t.description ?? templateKey
  } catch {
    return templateKey
  }
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  sent:      { label: "Sent",      icon: CheckCircle2, className: "text-muted-foreground" },
  delivered: { label: "Delivered", icon: CheckCircle2, className: "text-success" },
  read:      { label: "Read",      icon: CheckCircle2, className: "text-success" },
  failed:    { label: "Failed",    icon: XCircle,      className: "text-destructive" },
  logged:    { label: "Logged",    icon: CheckCircle2, className: "text-muted-foreground" },
}

export default async function CommunicationsPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()

  const { data: comms, error } = await service
    .from("communication_log")
    .select("id, template_key, subject, channel, status, created_at, body, direction")
    .eq("tenant_id", session.tenantId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[/tenant/communications] query failed:", error.message)
  }

  const rows = comms ?? []

  if (rows.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Tenant"
        title="Communications"
        headline="Nothing on record yet"
        headerSub="All notices and messages sent to you by your managing agent."
        emptyTitle="No communications on record yet"
        emptySub="Notices and messages your managing agent sends you will appear here."
        icon={<Mail className="h-6 w-6" />}
      />
    )
  }

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Tenant"
        title="Communications"
        headline={`${rows.length} message${rows.length === 1 ? "" : "s"}`}
        sub="All notices and messages sent to you by your managing agent."
      />
      <ListCard>
        <div className="divide-y divide-border">
          {rows.map((comm) => {
            const mandatory = isTemplateMandatory(comm.template_key as string | null)
            const label = templateLabel(comm.template_key as string | null)
            const status = STATUS_CONFIG[(comm.status as string) ?? ""] ?? STATUS_CONFIG.sent
            const StatusIcon = status.icon
            const ChannelIcon = CHANNEL_ICONS[(comm.channel as string) ?? "email"] ?? Mail

            return (
              <Link
                key={comm.id}
                href={`/tenant/communications/${comm.id}`}
                className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <ChannelIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{(comm.subject as string) || label}</p>
                    {mandatory && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-button)] border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Notice
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  {comm.body && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{comm.body as string}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`flex items-center gap-1 text-xs ${status.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDateZA(comm.created_at as string)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </ListCard>
    </div>
  )
}
