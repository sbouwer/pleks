import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { gateway } from "@/lib/supabase/gateway"

function hashRow(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16)
}

function toSyncItems<T extends { id: string; updated_at?: string | null }>(
  rows: T[],
): Array<{ id: string; hash: string; updatedAt: string; data: T }> {
  return rows.map((row) => ({
    id: row.id,
    hash: hashRow(row),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    data: row,
  }))
}

export async function GET() {
  const ctx = await gateway()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const fiveDaysFromNow = new Date()
  fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5)

  const [contactsRes, propertiesRes, inspectionsRes, maintenanceRes] = await Promise.all([
    ctx.db
      .from("contacts")
      .select("id, first_name, last_name, company_name, primary_email, primary_phone, primary_role, updated_at")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null),

    ctx.db
      .from("properties")
      .select("id, name, address_line1, suburb, city, province, updated_at")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null),

    ctx.db
      .from("inspections")
      .select("id, inspection_type, status, scheduled_date, unit_id, updated_at")
      .eq("org_id", ctx.orgId)
      .in("status", ["scheduled", "in_progress"])
      .lte("scheduled_date", fiveDaysFromNow.toISOString()),

    ctx.db
      .from("maintenance_requests")
      .select("id, title, status, urgency, unit_id, updated_at")
      .eq("org_id", ctx.orgId)
      .not("status", "in", '("completed","closed","cancelled")'),
  ])

  if (contactsRes.error) console.error("sync-manifest contacts:", contactsRes.error.message)
  if (propertiesRes.error) console.error("sync-manifest properties:", propertiesRes.error.message)
  if (inspectionsRes.error) console.error("sync-manifest inspections:", inspectionsRes.error.message)
  if (maintenanceRes.error) console.error("sync-manifest maintenance:", maintenanceRes.error.message)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    orgId: ctx.orgId,
    contacts: toSyncItems(contactsRes.data ?? []),
    properties: toSyncItems(propertiesRes.data ?? []),
    inspections: toSyncItems(inspectionsRes.data ?? []),
    maintenance: toSyncItems(maintenanceRes.data ?? []),
  })
}
