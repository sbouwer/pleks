/**
 * app/api/applications/resend-link/route.ts — re-email a returning applicant their resume link.
 *
 * Route:  POST /api/applications/resend-link
 * Auth:   PUBLIC / UNAUTHENTICATED. Looks up the latest non-submitted draft for {email, listing} and re-sends the
 *         resume link to that email. org_id derived server-side from slug → listing. Rate-limited.
 * Notes:  ANTI-ENUMERATION — ALWAYS returns { ok: true } regardless of whether a draft exists, so the endpoint
 *         can't be used to probe which emails have applied. The link only ever goes to the email on the draft.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { sendApplicationResumeLink } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SUPABASE_URL, requireEnv } from "@/lib/env"

function getServiceClient() {
  return createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
}
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  if (!rateLimit(`app-resend-link:${getClientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const body = await req.json().catch(() => ({})) as { slug?: string; email?: string }
  const email = body.email?.trim()
  // Always answer ok (anti-enumeration) — only proceed to send when we actually have a matching draft.
  if (!body.slug || !email) return NextResponse.json({ ok: true })

  const db = getServiceClient()
  const { data: listing, error: listErr } = await db.from("listings")
    .select("id, org_id, units(unit_number, properties(name, city))")
    .eq("public_slug", body.slug).eq("status", "active").maybeSingle()
  logQueryError("resend-link listing", listErr)
  if (!listing) return NextResponse.json({ ok: true })

  // Latest non-submitted, non-deleted draft for this email on this listing.
  const { data: draft, error: draftErr } = await db.from("applications")
    .select("id, first_name").eq("listing_id", listing.id as string).ilike("applicant_email", email)
    .is("submitted_at", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("resend-link draft", draftErr)
  if (!draft) return NextResponse.json({ ok: true })

  // Mint a fresh 30-day token and email the resume link to the draft's email.
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  const { error: tokErr } = await db.from("application_tokens").insert({
    application_id: draft.id as string, token, token_type: "application", applicant_email: email, expires_at: expiresAt,
  })
  logQueryError("resend-link token", tokErr)

  try {
    const orgId = listing.org_id as string
    const { data: org, error: orgErr } = await db.from("organisations").select("name, email, phone").eq("id", orgId).single()
    logQueryError("resend-link org", orgErr)
    const branding = buildBranding(await fetchOrgSettings(orgId))
    const unit = (listing as unknown as { units?: { unit_number?: string | null; properties?: { name?: string | null; city?: string | null } | null } | null }).units
    const url = `${req.nextUrl.origin}/apply/${body.slug}?app=${draft.id as string}&token=${encodeURIComponent(token)}`
    await sendApplicationResumeLink(
      { email, firstName: (draft.first_name as string | null) ?? undefined },
      { unitLabel: unit?.unit_number ?? "the unit", propertyName: unit?.properties?.name ?? "the property", city: unit?.properties?.city ?? undefined },
      { orgId, orgName: org?.name ?? "Pleks", orgEmail: org?.email ?? undefined, orgPhone: org?.phone ?? undefined, branding },
      { resumeUrl: url, applicationId: draft.id as string },
    )
  } catch (e) {
    console.error("[resend-link] send failed:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}
