import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

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

  const serviceSupabase = await createServiceClient()
  const storagePath = `orgs/${membership.org_id}/leases/${leaseId}/signed_original.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await serviceSupabase.storage
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
  await supabase
    .from("leases")
    .update({ external_document_path: storagePath })
    .eq("id", leaseId)

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: membership.org_id,
    table_name: "leases",
    record_id: leaseId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: {
      action: "external_document_uploaded",
      path: storagePath,
      filename: file.name,
    },
  })

  return NextResponse.json({ ok: true, path: storagePath })
}
