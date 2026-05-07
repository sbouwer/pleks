/**
 * app/(tenant)/tenant/communications/page.tsx — tenant communication history
 *
 * Route:  /tenant/communications
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log via service client, filtered by tenant_id
 * Notes:  BUILD_63 Phase 8 (§9.1). Mandatory comms show a badge and link to the detail page.
 *         Only comms sent after the tenant_id fix (BUILD_63 §14) will appear here.
 */

import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { getTemplate } from "@/lib/comms/template-registry"
import { Mail, MessageSquare, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

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
  sent:      { label: "Sent",      icon: CheckCircle2, className: "text-blue-600" },
  delivered: { label: "Delivered", icon: CheckCircle2, className: "text-green-600" },
  read:      { label: "Read",      icon: CheckCircle2, className: "text-green-700" },
  failed:    { label: "Failed",    icon: XCircle,      className: "text-red-600" },
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl">Communications</h1>
        <p className="text-sm text-muted-foreground mt-1">All notices and messages sent to you by your managing agent.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card px-5 py-10 text-center">
          <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No communications on record yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
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
                className="flex items-start gap-4 rounded-xl border border-border/60 bg-card px-4 py-3 hover:border-brand/40 transition-colors"
              >
                <ChannelIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{(comm.subject as string) || label}</p>
                    {mandatory && (
                      <Badge className="bg-amber-100 text-amber-700 text-xs shrink-0">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Notice
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  {comm.body && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{comm.body as string}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`flex items-center gap-1 text-xs ${status.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(comm.created_at as string).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
