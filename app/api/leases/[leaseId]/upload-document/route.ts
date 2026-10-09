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
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_LABEL } from "@/lib/constants"
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

  // Validate size — Vercel refuses a larger body before this runs, so the guard states the limit that applies.
  if (file.size > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: `File must be under ${UPLOAD_MAX_LABEL}` }, { status: 400 })
  }

  // Validate type
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["pdf", "docx"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF and DOCX files accepted" }, { status: 400 })
  }

  // The lease must be this org's before anything is stored under its id.
  const { data: lease, error: leaseError } = await db
    .from("leases").select("id").eq("org_id", orgId).eq("id", leaseId).maybeSingle()
  if (leaseError) {
    console.error("upload-document: lease read failed", leaseId, leaseError.message)
    return NextResponse.json({ error: "Could not load the lease" }, { status: 500 })
  }
  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

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

  // Link it to the lease. Checked: until 2026-10-09 the result was discarded, so a failed link still answered
  // ok and wrote an audit row for a document no lease points at — the agent saw "uploaded", the lease had none.
  // Affected rows checked too: a lease deleted after the pre-check is a zero-row update with no error.
  const { data: linked, error: linkError } = await db
    .from("leases")
    .update({ external_document_path: storagePath })
    .eq("org_id", orgId)
    .eq("id", leaseId)
    .select("id")
  if (linkError || !linked?.length) {
    console.error("upload-document: link failed for lease", leaseId, linkError?.message ?? "no row updated")
    return NextResponse.json({ error: "The document uploaded but could not be attached to the lease" }, { status: 500 })
  }

  // Audit log
  await recordAudit(db, { orgId: orgId, table: "leases", recordId: leaseId, action: "UPDATE", actorId: userId, after: {
      action: "external_document_uploaded",
      path: storagePath,
      filename: file.name,
    } })

  return NextResponse.json({ ok: true, path: storagePath })
}
