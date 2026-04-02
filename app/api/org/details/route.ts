import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const IDENTITY_FIELDS = [
  "name",
  "trading_as",
  "reg_number",
  "eaab_number",
  "vat_number",
  "email",
  "phone",
  "address",
  "website",
] as const

type IdentityField = (typeof IDENTITY_FIELDS)[number]
type IdentityPatch = Partial<Record<IdentityField, string | null>>

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data: org, error } = await supabase
    .from("organisations")
    .select("id, name, trading_as, reg_number, eaab_number, vat_number, email, phone, address, website, type")
    .eq("id", orgId)
    .single()

  if (error || !org) {
    return NextResponse.json({ error: "Failed to fetch organisation" }, { status: 500 })
  }

  const d = org as unknown as {
    id: string
    name: string | null
    trading_as: string | null
    reg_number: string | null
    eaab_number: string | null
    vat_number: string | null
    email: string | null
    phone: string | null
    address: string | null
    website: string | null
    type: "agency" | "landlord" | "sole_prop" | null
  }

  return NextResponse.json({
    id: d.id,
    name: d.name ?? null,
    trading_as: d.trading_as ?? null,
    reg_number: d.reg_number ?? null,
    eaab_number: d.eaab_number ?? null,
    vat_number: d.vat_number ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    address: d.address ?? null,
    website: d.website ?? null,
    type: d.type ?? "agency",
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const patch: IdentityPatch = {}
  for (const field of IDENTITY_FIELDS) {
    if (field in (body as Record<string, unknown>)) {
      const value = (body as Record<string, unknown>)[field]
      if (value !== null && typeof value !== "string") {
        return NextResponse.json(
          { error: `Field "${field}" must be a string or null` },
          { status: 400 }
        )
      }
      patch[field] = value as string | null
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const { error } = await supabase
    .from("organisations")
    .update(patch)
    .eq("id", orgId)

  if (error) {
    return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
