import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const ALL_FIELDS = [
  "name", "trading_as", "reg_number", "eaab_number", "vat_number",
  "email", "phone", "address", "website",
  // personal / owner fields
  "title", "first_name", "last_name", "initials", "gender",
  "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
] as const

type OrgField = (typeof ALL_FIELDS)[number]

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()
  return membership?.org_id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 })

  const selectFields = [...ALL_FIELDS, "id", "type", "user_type"].join(", ")
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

  const result: Record<string, string | null> = { id: d.id, type: effectiveType }
  for (const field of ALL_FIELDS) {
    result[field] = d[field] ?? null
  }
  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 })

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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const { error } = await supabase.from("organisations").update(patch).eq("id", orgId)
  if (error) return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
