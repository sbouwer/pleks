import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

interface Body {
  itemId: string
  condition: string
  notes?: string
}

/**
 * PATCH /api/inspection/[id]/item-condition
 *
 * Flushes a pending offline write — updates an inspection item's condition
 * and notes. Used by syncEngine.flushPendingWrites() after connectivity returns.
 * Idempotent: runs the same UPDATE multiple times safely.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: inspectionId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await request.json() as Body
  const { itemId, condition, notes } = body
  if (!itemId || !condition) {
    return NextResponse.json({ error: "itemId and condition are required" }, { status: 400 })
  }

  // Verify the inspection belongs to this org
  const { data: insp, error: inspError } = await db
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("org_id", orgId)
    .single()

  if (inspError || !insp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Update the item — restrict to this inspection for security
  const { error } = await db
    .from("inspection_items")
    .update({ condition, condition_notes: notes || null })
    .eq("id", itemId)
    .eq("inspection_id", inspectionId)

  if (error) {
    console.error("item-condition PATCH failed:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
