import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getOrgDisplayName } from "@/lib/org/displayName"

const BRANDING_FIELDS = [
  "lease_logo_path",
  "lease_display_name",
  "lease_registration_number",
  "lease_address",
  "lease_phone",
  "lease_email",
  "lease_website",
  "lease_accent_color",
] as const

type BrandingField = (typeof BRANDING_FIELDS)[number]
type BrandingPatch = Partial<Record<BrandingField, string | null>>

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
    .select(
      [
        "name",
        "type",
        "user_type",
        "trading_as",
        "title",
        "first_name",
        "last_name",
        "initials",
        ...BRANDING_FIELDS,
      ].join(", ")
    )
    .eq("id", orgId)
    .single()

  if (error || !org) {
    return NextResponse.json({ error: "Failed to fetch branding" }, { status: 500 })
  }

  const orgData = org as unknown as {
    name: string
    type: string
    user_type: string | null
    trading_as: string | null
    title: string | null
    first_name: string | null
    last_name: string | null
    initials: string | null
    lease_logo_path: string | null
    lease_display_name: string | null
    lease_registration_number: string | null
    lease_address: string | null
    lease_phone: string | null
    lease_email: string | null
    lease_website: string | null
    lease_accent_color: string | null
  }

  // Generate a signed URL for the logo if a path is stored
  let logoUrl: string | null = null
  if (orgData.lease_logo_path) {
    const { data: signed } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(orgData.lease_logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return NextResponse.json({
    orgName: getOrgDisplayName(orgData),
    logoUrl,
    lease_logo_path: orgData.lease_logo_path ?? null,
    lease_display_name: orgData.lease_display_name ?? null,
    lease_registration_number: orgData.lease_registration_number ?? null,
    lease_address: orgData.lease_address ?? null,
    lease_phone: orgData.lease_phone ?? null,
    lease_email: orgData.lease_email ?? null,
    lease_website: orgData.lease_website ?? null,
    lease_accent_color: orgData.lease_accent_color ?? null,
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

  // Only pick recognised branding fields from the request body
  const patch: BrandingPatch = {}
  for (const field of BRANDING_FIELDS) {
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
    return NextResponse.json({ error: "No valid branding fields provided" }, { status: 400 })
  }

  const { error } = await supabase
    .from("organisations")
    .update(patch)
    .eq("id", orgId)

  if (error) {
    return NextResponse.json({ error: "Failed to update branding" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
