/**
 * app/api/profile/photo/route.ts — upload / remove the agent's profile photo (My profile › Personal)
 *
 * Route:  POST (multipart file) / DELETE
 * Auth:   getUser (the photo is the user's own); writes user_profiles.avatar_url for that user only.
 * Data:   uploads to the PUBLIC org-assets bucket (agent-photos/<userId>.<ext>) and stores the public URL on
 *         user_profiles.avatar_url. Public (not signed) because the photo is shown on public listing/apply pages
 *         (the agent card) — a signed URL would expire. A ?v= cache-buster makes a re-upload show immediately.
 * Notes:  Consented marketing use — the agent opts in by uploading. PNG/JPG ≤ 2 MB.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!["image/png", "image/jpeg"].includes(file.type)) return NextResponse.json({ error: "PNG or JPG only" }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Max 2 MB" }, { status: 400 })

  const ext = file.type === "image/png" ? "png" : "jpg"
  const storagePath = `agent-photos/${user.id}.${ext}`
  const bytes = await file.arrayBuffer()

  const service = await createServiceClient()
  const { error: uploadError } = await service.storage
    .from("org-assets")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const publicUrl = service.storage.from("org-assets").getPublicUrl(storagePath).data.publicUrl
  const photoUrl = `${publicUrl}?v=${Date.now()}`   // cache-buster so a re-upload shows immediately

  const { error: updErr } = await service.from("user_profiles").update({ avatar_url: photoUrl }).eq("id", user.id)
  if (updErr) {
    console.error("profile photo save failed:", updErr.message)
    return NextResponse.json({ error: "Could not save photo" }, { status: 500 })
  }
  return NextResponse.json({ photoUrl })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  await service.storage.from("org-assets").remove([`agent-photos/${user.id}.png`, `agent-photos/${user.id}.jpg`])
  const { error: updErr } = await service.from("user_profiles").update({ avatar_url: null }).eq("id", user.id)
  if (updErr) {
    console.error("profile photo remove failed:", updErr.message)
    return NextResponse.json({ error: "Could not remove photo" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
