import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 })
  }

  const allowed = ["image/png", "image/jpeg"]
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "PNG or JPG only" }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 2 MB" }, { status: 400 })
  }

  const ext = file.type === "image/png" ? "png" : "jpg"
  const storagePath = `org-${membership.org_id}/branding/logo.${ext}`
  const bytes = await file.arrayBuffer()

  const serviceClient = await createServiceClient()
  const { error: uploadError } = await serviceClient.storage
    .from("org-assets")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  await supabase
    .from("organisations")
    .update({ brand_logo_path: storagePath } as unknown as Record<string, unknown>)
    .eq("id", membership.org_id)

  const { data: signed } = await supabase.storage
    .from("org-assets")
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({ logoUrl: signed?.signedUrl ?? null })
}
