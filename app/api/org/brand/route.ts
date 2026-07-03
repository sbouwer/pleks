/**
 * app/api/org/brand/route.ts — read/update the organisation's document branding (Organisation › Branding)
 *
 * Route:  GET/PATCH /api/org/brand
 * Auth:   gateway() (agent session + org membership)
 * Data:   organisations.brand_* columns, org-scoped via gateway orgId; logo lives in the private
 *         org-assets bucket and is returned as a fresh signed URL via the gateway service db.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess — branding is the org's
 *         own settings ("your data, always"). Signing uses the service db (the cookie client can't sign
 *         the private bucket → a null logoUrl, so the logo silently never previews).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

const BRAND_FIELDS = [
  "brand_logo_path",
  "brand_accent_color",
  "brand_cover_template",
  "brand_font",
] as const

type BrandField = (typeof BRAND_FIELDS)[number]
type BrandPatch = Partial<Record<BrandField, string | null>>

export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: org, error } = await db
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
    const { data: signed, error: signedError } = await db.storage
      .from("org-assets")
      .createSignedUrl(d.brand_logo_path, 3600)
    logQueryError("GET org-assets", signedError)
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
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

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

  const { error } = await db
    .from("organisations")
    .update(patch)
    .eq("id", orgId)

  if (error) {
    return NextResponse.json({ error: "Failed to update branding" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
