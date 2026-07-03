/**
 * app/api/inspection/[id]/signature/route.ts — capture an agent/tenant signature on an inspection
 *
 * Route:  POST /api/inspection/[id]/signature (multipart: "file" PNG, "sigType")
 * Auth:   requireAgentWriteAccess("sign_off_inspection") — advancing an inspection to signed-off is a
 *         business-object transition, so it is subscription-lockdown gated.
 * Data:   uploads the signature PNG to the inspection-photos bucket and inserts an inspection_photos
 *         record (org-scoped via the gateway orgId).
 * Notes:  Lockdown surfaces as a clean 403 ({ code: "subscription_locked" }), never a 500.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"

// POST /api/inspection/[id]/signature
// Accepts multipart/form-data with "file" (PNG blob) and "sigType" ("agent" | "tenant")
// Saves to inspection-photos bucket and inserts an inspection_photos record.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inspectionId } = await params
  let gw
  try {
    gw = await requireAgentWriteAccess("sign_off_inspection")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, userId, orgId } = gw

  const formData = await req.formData()
  const file = formData.get("file")
  const sigType = (formData.get("sigType") as string) || "agent"

  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!["agent", "tenant", "sign_off"].includes(sigType)) return NextResponse.json({ error: "invalid sigType" }, { status: 400 })
  if (file.type !== "image/png") return NextResponse.json({ error: "PNG only" }, { status: 400 })
  if (file.size > 500 * 1024) return NextResponse.json({ error: "Max 500 KB" }, { status: 400 })

  const storagePath = `${orgId}/${inspectionId}/signatures/${sigType}.png`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from("inspection-photos")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Record as inspection_photo with caption = "agent_signature" / "tenant_signature"
  const { data: photo, error: insertError } = await db
    .from("inspection_photos")
    .insert({
      org_id: orgId,
      inspection_id: inspectionId,
      storage_path_original: storagePath,
      caption: `${sigType}_signature`,
      uploaded_by: userId,
    })
    .select("id")
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ id: photo.id, path: storagePath })
}
