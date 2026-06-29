/**
 * app/(tenant)/tenant/account/data-export/page.tsx — POPIA tenant communications self-export
 *
 * Route:  /tenant/account/data-export
 * Auth:   getTenantSession (token-gated tenant portal)
 * Data:   communication_log via service client, filtered by tenant_id
 * Notes:  POPIA s23 data subject access right. Renders all comms addressed to this tenant
 *         in a print-friendly format. Use browser "Print to PDF" to save. BUILD_63 Phase 8 (§9.7).
 *         Full programmatic PDF generation (mirroring /api/legal/comm-export) is deferred.
 */

import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "@/lib/comms/template-registry"
import { ChevronLeft } from "lucide-react"
import { PrintButton } from "./PrintButton"

function templateLabel(key: string | null): string {
  if (!key) return "Communication"
  try { return getTemplate(key).description ?? key } catch { return key }
}

function isMandatory(key: string | null): boolean {
  if (!key) return false
  try { return getTemplate(key).is_mandatory ?? false } catch { return false }
}

export default async function DataExportPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()

  const { data: comms, error } = await service
    .from("communication_log")
    .select("id, template_key, subject, channel, status, created_at, body, direction, sent_to_email")
    .eq("tenant_id", session.tenantId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[data-export] query failed:", error.message)
  }

  const rows = comms ?? []
  const exportDate = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="max-w-3xl">
      <div className="no-print">
        <Link
          href="/tenant/account"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to account
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl">Data Export</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your communications record in terms of POPIA s23 (data subject access right).
              Use <strong>File → Print → Save as PDF</strong> to download a copy.
            </p>
          </div>
          <PrintButton />
        </div>
      </div>

      {/* Print-friendly export */}
      <div className="space-y-6 rounded-[var(--r-button)] border border-border bg-card p-6 print:border-0 print:p-0 print:shadow-none">
        <div className="border-b pb-4">
          <h2 className="font-semibold text-lg">Pleks — Tenant Communications Record</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tenant: <strong>{session.tenantName}</strong><br />
            Export date: {exportDate}<br />
            Total communications: {rows.length}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This export is provided pursuant to your rights under the Protection of Personal Information Act 4
            of 2013 (POPIA), specifically s23 (right of access). It includes all communications sent to you
            through the Pleks platform by your managing agent.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No communications on record.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((comm, i) => (
              <div key={comm.id} className="border-b pb-4 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {i + 1}. {(comm.subject as string | null) || templateLabel(comm.template_key as string | null)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {templateLabel(comm.template_key as string | null)}
                      {isMandatory(comm.template_key as string | null) && " · Mandatory notice"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium">
                      {new Date(comm.created_at as string).toLocaleDateString("en-ZA", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {comm.channel as string} · {comm.status as string}
                    </p>
                  </div>
                </div>
                {comm.body && (
                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{comm.body as string}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 font-mono opacity-60">ID: {comm.id}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 text-xs text-muted-foreground">
          <p>
            This document was generated by the Pleks property management platform on {exportDate}.
            For questions about this record, contact your managing agent or Pleks at{" "}
            <span className="font-medium">privacy@pleks.co.za</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
