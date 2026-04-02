import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const BRAND_FIELDS = [
  "brand_logo_path",
  "brand_accent_color",
  "brand_cover_template",
  "brand_font",
] as const

type BrandField = (typeof BRAND_FIELDS)[number]
type BrandPatch = Partial<Record<BrandField, string | null>>

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
    .select("brand_logo_path, brand_accent_color, brand_cover_template, brand_font")
    .eq("id", orgId)
    .single()

  if (error || !org) {
    return NextResponse.json({ error: "Failed to fetch branding" }, { status: 500 })
  }

  const d = org as unknown as {
    brand_logo_path: string | null
    brand_accent_color: string | null
    brand_cover_template: string | null
    brand_font: string | null
  }

  let logoUrl: string | null = null
  if (d.brand_logo_path) {
    const { data: signed } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(d.brand_logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  return NextResponse.json({
    logoUrl,
    brand_logo_path: d.brand_logo_path ?? null,
    brand_accent_color: d.brand_accent_color ?? "#1a3a5c",
    brand_cover_template: d.brand_cover_template ?? "classic",
    brand_font: d.brand_font ?? "inter",
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

  const patch: BrandPatch = {}
  for (const field of BRAND_FIELDS) {
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
    return NextResponse.json({ error: "No valid brand fields provided" }, { status: 400 })
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
