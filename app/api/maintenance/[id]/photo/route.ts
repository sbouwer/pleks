import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { randomUUID } from "crypto"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No org" }, { status: 403 })
  }

  const orgId = membership.org_id as string

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const caption = formData.get("caption") as string | null
  const phase = (formData.get("phase") as string | null) ?? "during"

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() ?? "jpg"
  const uuid = randomUUID()
  const storagePath = `${orgId}/${requestId}/${uuid}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await service.storage
    .from("maintenance-photos")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: photo, error: insertError } = await service
    .from("maintenance_photos")
    .insert({
      org_id: orgId,
      request_id: requestId,
      storage_path: storagePath,
      caption: caption ?? null,
      uploaded_by_type: "agent",
      uploaded_by_user: user.id,
      photo_phase: phase,
    })
    .select("id, storage_path")
    .single()

  if (insertError || !photo) {
    return NextResponse.json({ error: insertError?.message ?? "Insert failed" }, { status: 500 })
  }

  return NextResponse.json({ id: photo.id, path: photo.storage_path })
}
