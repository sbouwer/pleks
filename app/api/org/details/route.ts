import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"

const ALL_FIELDS = [
  "name", "trading_as", "reg_number", "eaab_number", "vat_number",
  "email", "phone", "address", "website",
  // personal / owner fields
  "title", "first_name", "last_name", "initials", "gender",
  "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
  // operating hours & emergency contact (ADDENDUM_00B)
  "office_hours_weekday", "office_hours_saturday", "office_hours_sunday", "office_hours_public_holidays",
  "emergency_phone", "emergency_contact_name", "emergency_instructions", "emergency_email",
] as const


export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const m = await getMembership(service, user.id)
  if (!m) return NextResponse.json({ error: "No org" }, { status: 403 })
  const { org_id: orgId } = m

  const selectFields = [...ALL_FIELDS, "id", "type", "user_type", "primary_contact_is_user"].join(", ")
  const { data: org, error } = await supabase
    .from("organisations")
    .select(selectFields)
    .eq("id", orgId)
    .single()

  if (error || !org) {
    return NextResponse.json({ error: "Failed to fetch organisation" }, { status: 500 })
  }

  const d = org as unknown as Record<string, string | null>

  let effectiveType: "agency" | "landlord" | "sole_prop" = "agency"
  if (d.type === "landlord" || d.user_type === "owner") {
    effectiveType = "landlord"
  } else if (d.type === "sole_prop") {
    effectiveType = "sole_prop"
  }

  const result: Record<string, string | null | boolean> = { id: d.id, type: effectiveType }
  for (const field of ALL_FIELDS) {
    result[field] = d[field] ?? null
  }
  const pcUser = (d as unknown as Record<string, unknown>)["primary_contact_is_user"]
  result["primary_contact_is_user"] = typeof pcUser === "boolean" ? pcUser : true
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const m = await getMembership(service, user.id)
  if (!m) return NextResponse.json({ error: "No org" }, { status: 403 })
  const { org_id: orgId, isAdmin } = m
  if (!isAdmin) return NextResponse.json({ error: "Admin access required to update org settings" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const patch: Record<string, string | null> = {}
  for (const field of ALL_FIELDS) {
    if (field in (body as Record<string, unknown>)) {
      const value = (body as Record<string, unknown>)[field]
      if (value !== null && typeof value !== "string") {
        return NextResponse.json({ error: `Field "${field}" must be a string or null` }, { status: 400 })
      }
      patch[field] = value as string | null
    }
  }

  // Accept primary_contact_is_user as a boolean alongside string fields
  const boolPatch: Record<string, boolean> = {}
  const bodyObj = body as Record<string, unknown>
  if ("primary_contact_is_user" in bodyObj) {
    if (typeof bodyObj["primary_contact_is_user"] !== "boolean") {
      return NextResponse.json({ error: "primary_contact_is_user must be a boolean" }, { status: 400 })
    }
    boolPatch["primary_contact_is_user"] = bodyObj["primary_contact_is_user"]
  }

  if (Object.keys(patch).length === 0 && Object.keys(boolPatch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const { error } = await supabase.from("organisations").update({ ...patch, ...boolPatch }).eq("id", orgId)
  if (error) return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
