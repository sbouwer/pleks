import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: inspectionId } = await params

  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Inspection header
  const { data: insp, error: inspError } = await db
    .from("inspections")
    .select("id, inspection_type, status, scheduled_date, unit_id, tenant_id, units(unit_number, properties(name))")
    .eq("id", inspectionId)
    .eq("org_id", orgId)
    .single()

  if (inspError || !insp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Tenant phone (if tenant attached)
  let tenantName: string | null = null
  let tenantPhone: string | null = null
  if (insp.tenant_id) {
    const { data: tv } = await db
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", insp.tenant_id)
      .single()
    if (tv) {
      tenantName = `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim() || null
      tenantPhone = (tv.phone as string | null) ?? null
    }
  }

  // Rooms + items
  const { data: rooms, error: roomsError } = await db
    .from("inspection_rooms")
    .select("id, room_type, room_label, display_order, inspection_items(id, item_name, item_category, condition, condition_notes)")
    .eq("inspection_id", inspectionId)
    .order("display_order")

  if (roomsError) {
    return NextResponse.json({ error: roomsError.message }, { status: 500 })
  }

  const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null

  return NextResponse.json({
    inspectionId,
    inspectionType: insp.inspection_type as string,
    status: insp.status as string,
    unitNumber: unit?.unit_number ?? "",
    propertyName: unit?.properties?.name ?? "",
    tenantName,
    tenantPhone,
    scheduledDate: (insp.scheduled_date as string | null) ?? null,
    rooms: (rooms ?? []).map((r) => ({
      id: r.id as string,
      room_type: r.room_type as string,
      room_label: r.room_label as string,
      display_order: r.display_order as number,
      items: ((r.inspection_items as unknown as {
        id: string; item_name: string; item_category: string | null
        condition: string | null; condition_notes: string | null
      }[]) ?? []).map((i) => ({
        id: i.id,
        item_name: i.item_name,
        item_category: i.item_category,
        condition: i.condition,
        condition_notes: i.condition_notes,
      })),
    })),
  })
}
