/**
 * app/api/org/branding/logo/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

// POST /api/org/branding/logo
// Accepts multipart/form-data with a "file" field (PNG/JPG/WebP, max 2MB).
// Uploads to org-assets/{orgId}/lease-branding/logo.{ext}, stores path in organisations.lease_logo_path,
// and returns { logoUrl } as a 1-hour signed URL.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })

  const allowed = ["image/png", "image/jpeg", "image/webp"]
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "PNG, JPG or WebP only" }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 2 MB" }, { status: 400 })
  }

  let ext: string
  if (file.type === "image/png") { ext = "png" }
  else if (file.type === "image/webp") { ext = "webp" }
  else { ext = "jpg" }
  const storagePath = `${membership.org_id}/lease-branding/logo.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from("org-assets")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  await supabase
    .from("organisations")
    .update({ lease_logo_path: storagePath })
    .eq("id", membership.org_id)

  const { data: signed, error: signedError } = await supabase.storage
    .from("org-assets")
    .createSignedUrl(storagePath, 3600)
    logQueryError("POST org-assets", signedError)

  return NextResponse.json({ logoUrl: signed?.signedUrl ?? null })
}
