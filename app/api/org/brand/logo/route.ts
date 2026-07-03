/**
 * app/api/org/brand/logo/route.ts — upload the organisation's document logo (Organisation › Branding)
 *
 * Route:  POST /api/org/brand/logo (multipart file)
 * Auth:   gateway() (agent session + org membership)
 * Data:   uploads to the private org-assets bucket (org-<id>/branding/logo.<ext>), stores the path on
 *         organisations.brand_logo_path, returns a fresh signed URL for immediate preview.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess — uploading your own logo
 *         is "your data, always". Upload AND signing use the gateway service db (the cookie client can't
 *         sign the private bucket, which silently returned a null logoUrl).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

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
  const storagePath = `org-${orgId}/branding/logo.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from("org-assets")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  await db
    .from("organisations")
    .update({ brand_logo_path: storagePath } as unknown as Record<string, unknown>)
    .eq("id", orgId)

  const { data: signed, error: signedError } = await db.storage
    .from("org-assets")
    .createSignedUrl(storagePath, 3600)
  logQueryError("POST org-assets", signedError)

  return NextResponse.json({ logoUrl: signed?.signedUrl ?? null, logoPath: storagePath })
}
