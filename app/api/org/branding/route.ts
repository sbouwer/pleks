/**
 * app/api/org/branding/route.ts — read/update the org's lease-document branding (display name, logo, contact)
 *
 * Route:  GET/PATCH /api/org/branding
 * Auth:   gateway() (agent session + org membership)
 * Data:   organisations lease_* branding columns (+ identity fields for the display name), org-scoped via
 *         gateway orgId; lease logo lives in the private org-assets bucket, returned as a signed URL.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess — lease branding is the
 *         org's own settings ("your data, always"). Signing uses the service db (private bucket).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { getOrgDisplayName } from "@/lib/org/displayName"
import { logQueryError } from "@/lib/supabase/logQueryError"

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

export async function GET() {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: org, error } = await db
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
    const { data: signed, error: signedError } = await db.storage
      .from("org-assets")
      .createSignedUrl(orgData.lease_logo_path, 3600)
    logQueryError("GET org-assets", signedError)
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

  const { error } = await db
    .from("organisations")
    .update(patch)
    .eq("id", orgId)

  if (error) {
    return NextResponse.json({ error: "Failed to update branding" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
