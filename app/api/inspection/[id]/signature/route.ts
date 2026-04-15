import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// POST /api/inspection/[id]/signature
// Accepts multipart/form-data with "file" (PNG blob) and "sigType" ("agent" | "tenant")
// Saves to inspection-photos bucket and inserts an inspection_photos record.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inspectionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: memberError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (memberError || !membership) return NextResponse.json({ error: "No org" }, { status: 403 })
  const { org_id: orgId } = membership

  const formData = await req.formData()
  const file = formData.get("file")
  const sigType = (formData.get("sigType") as string) || "agent"

  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!["agent", "tenant", "sign_off"].includes(sigType)) return NextResponse.json({ error: "invalid sigType" }, { status: 400 })
  if (file.type !== "image/png") return NextResponse.json({ error: "PNG only" }, { status: 400 })
  if (file.size > 500 * 1024) return NextResponse.json({ error: "Max 500 KB" }, { status: 400 })

  const storagePath = `${orgId}/${inspectionId}/signatures/${sigType}.png`
  const bytes = await file.arrayBuffer()

  const service = await createServiceClient()
  const { error: uploadError } = await service.storage
    .from("inspection-photos")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Record as inspection_photo with caption = "agent_signature" / "tenant_signature"
  const { data: photo, error: insertError } = await service
    .from("inspection_photos")
    .insert({
      org_id: orgId,
      inspection_id: inspectionId,
      storage_path_original: storagePath,
      caption: `${sigType}_signature`,
      uploaded_by: user.id,
    })
    .select("id")
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ id: photo.id, path: storagePath })
}
