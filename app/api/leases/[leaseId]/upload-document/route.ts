/**
 * app/api/leases/[leaseId]/upload-document/route.ts — upload a signed external lease document
 *
 * Route:  POST /api/leases/[leaseId]/upload-document
 * Auth:   gateway() (agent session + org membership)
 * Data:   documents storage bucket (org-pathed), leases.external_document_path (org-scoped), audit_log
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — attaching the org's own signed
 *         document to an existing lease, "your data, always" (no subscription lockdown). leaseId is
 *         a caller-supplied route param so the leases update is org-scoped by gw.orgId.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  // Config write → gateway() (no lockdown): org's own clause/template settings, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  // Validate size (20MB)
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 20MB" }, { status: 400 })
  }

  // Validate type
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["pdf", "docx"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF and DOCX files accepted" }, { status: 400 })
  }

  const storagePath = `orgs/${orgId}/leases/${leaseId}/signed_original.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: ext === "pdf" ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Update lease record
  await db
    .from("leases")
    .update({ external_document_path: storagePath })
    .eq("org_id", orgId)
    .eq("id", leaseId)

  // Audit log
  await recordAudit(db, { orgId: orgId, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId, after: {
      action: "external_document_uploaded",
      path: storagePath,
      filename: file.name,
    } })

  return NextResponse.json({ ok: true, path: storagePath })
}
