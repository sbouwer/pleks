/**
 * app/api/org/details/route.ts — read/update the organisation's own details (Organisation › Details)
 *
 * Route:  GET/PATCH /api/org/details
 * Auth:   gateway() (agent session + org membership); PATCH additionally requires org admin (gw.isAdmin)
 * Data:   organisations (column allowlist ALL_FIELDS), org-scoped via gateway orgId.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess. Split-check (org/details is
 *         the doctrine's ambiguous case): every ALL_FIELDS column is the org's own profile / contact /
 *         legal-identity data (name, VAT/reg/EAAB/id numbers, address, hours) — banking lives in
 *         bank_accounts, and there is no subscription/billing-plan field here. Editing it while paused is
 *         "your data, always", not net-new value creation, so no lockdown and no route split.
 *         The ALL_FIELDS allowlist is the write boundary — only listed columns can be patched.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { encryptIdNumber, decryptIdNumber } from "@/lib/crypto/idNumber"

const ALL_FIELDS = [
  "name", "trading_as", "reg_number", "eaab_number", "vat_number",
  "email", "phone", "address", "website",
  // social links (Organisation › Details → Contact)
  "linkedin_url", "facebook_url", "instagram_url", "x_url",
  // personal / owner fields
  "title", "first_name", "last_name", "initials", "gender",
  "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
  // operating hours & emergency contact (ADDENDUM_00B)
  "office_hours_monday", "office_hours_tuesday", "office_hours_wednesday", "office_hours_thursday", "office_hours_friday",
  "office_hours_saturday", "office_hours_sunday", "office_hours_public_holidays",
  "emergency_phone", "emergency_contact_name", "emergency_instructions", "emergency_email",
] as const


export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const selectFields = [...ALL_FIELDS, "id", "type", "user_type", "primary_contact_is_user"].join(", ")
  const { data: org, error } = await db
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
  // id_number (the owner/principal's SA ID) is encrypted at rest — decrypt for the owner-only edit form.
  // organisations has no id_number_hash column, so this surface is encrypt/decrypt only (no lookup hash).
  result["id_number"] = decryptIdNumber(d["id_number"])
  const pcUser = (d as unknown as Record<string, unknown>)["primary_contact_is_user"]
  result["primary_contact_is_user"] = typeof pcUser === "boolean" ? pcUser : true
  return NextResponse.json(result)
}

/** Validate + build the string-column patch from the body (ALL_FIELDS allowlist). id_number is encrypted at
 *  rest here (organisations has no hash column → encrypt only). Returns an error message on a wrong-typed field. */
function buildOrgStringPatch(body: Record<string, unknown>): { patch: Record<string, string | null> } | { error: string } {
  const patch: Record<string, string | null> = {}
  for (const field of ALL_FIELDS) {
    if (!(field in body)) continue
    const value = body[field]
    if (value !== null && typeof value !== "string") return { error: `Field "${field}" must be a string or null` }
    patch[field] = value as string | null
  }
  if ("id_number" in patch) patch.id_number = encryptIdNumber(patch.id_number)
  return { patch }
}

export async function PATCH(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId, isAdmin } = gw
  if (!isAdmin) return NextResponse.json({ error: "Admin access required to update org settings" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const bodyObj = body as Record<string, unknown>
  const parsed = buildOrgStringPatch(bodyObj)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const patch = parsed.patch

  // Accept primary_contact_is_user as a boolean alongside string fields
  const boolPatch: Record<string, boolean> = {}
  if ("primary_contact_is_user" in bodyObj) {
    if (typeof bodyObj["primary_contact_is_user"] !== "boolean") {
      return NextResponse.json({ error: "primary_contact_is_user must be a boolean" }, { status: 400 })
    }
    boolPatch["primary_contact_is_user"] = bodyObj["primary_contact_is_user"]
  }

  if (Object.keys(patch).length === 0 && Object.keys(boolPatch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const { error } = await db.from("organisations").update({ ...patch, ...boolPatch }).eq("id", orgId)
  if (error) return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
