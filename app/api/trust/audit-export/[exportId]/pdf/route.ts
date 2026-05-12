/**
 * app/api/trust/audit-export/[exportId]/pdf/route.ts — Serve trust audit export PDF
 *
 * Route:  /api/trust/audit-export/[exportId]/pdf
 * Auth:   gateway (org member) — verifies export belongs to caller's org
 * Data:   trust_audit_exports → trust-audit-exports storage bucket
 */

import { type NextRequest } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const { exportId } = await params
  const gw = await gateway()
  if (!gw) return new Response("Unauthorized", { status: 401 })
  const { orgId } = gw

  // Verify the export belongs to this org
  const db = await createServiceClient()
  const { data: exportRow, error } = await db
    .from("trust_audit_exports")
    .select("pdf_storage_path, period_id")
    .eq("id", exportId)
    .eq("org_id", orgId)
    .single()

  if (error || !exportRow) {
    return new Response("Not found", { status: 404 })
  }

  const { data: fileData, error: downloadErr } = await db.storage
    .from("trust-audit-exports")
    .download(exportRow.pdf_storage_path)

  if (downloadErr || !fileData) {
    console.error("[audit-export/pdf] storage download failed:", downloadErr?.message)
    return new Response("Export file not found", { status: 404 })
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const filename = `trust-audit-${exportRow.period_id.slice(0, 8)}.pdf`

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  })
}
