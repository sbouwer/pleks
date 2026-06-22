/**
 * app/api/applications/save-draft/route.ts — save & resume a draft application (ADDENDUM_14M follow-on).
 *
 * Route:  POST /api/applications/save-draft
 * Auth:   PUBLIC / UNAUTHENTICATED. A "draft" is an unsubmitted applications row (stage1_consent_given not
 *         true) — no separate PII store. org_id is derived SERVER-SIDE from slug → listing. Update is
 *         token-bound to the application id (the token is the capability). Rate-limited.
 * Notes:  UPSERT — no applicationId → create a minimal draft (email required, to send the resume link) +
 *         mint a 30-day token; with applicationId+token → update the filled fields. EVERY save/resume EXTENDS
 *         the token (now+30d) so a weeks-long document-gathering session isn't killed mid-edit. income_sources
 *         is validated + bounded server-side (shared parseIncomeSources). Returns { applicationId, token, resumeUrl }.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { parseIncomeSources } from "@/lib/applications/incomeSources"
import { sendApplicationResumeLink } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
type Db = ReturnType<typeof getServiceClient>
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface Body {
  slug?: string; applicationId?: string; token?: string; step?: number
  /** true ONLY when the applicant explicitly clicks "Save & finish later" — gates the resume email. Advancing
   *  through the wizard (createApplication) upserts the draft silently and must NOT email. */
  notify?: boolean
  first_name?: string; last_name?: string; email?: string; phone?: string
  id_type?: string; id_number?: string; date_of_birth?: string
  employment_type?: string; employer_name?: string; employment_start_date?: string
  gross_monthly_income?: string; income_sources?: unknown
  addresses?: unknown
}

const resumeUrl = (req: NextRequest, slug: string, id: string, token: string) =>
  `${req.nextUrl.origin}/apply/${slug}/preview?app=${id}&token=${encodeURIComponent(token)}`

/** Map the partial body → the application columns we persist (only what's filled). */
function draftFields(body: Body) {
  const parsed = parseIncomeSources(body.income_sources)
  let incomeCents: number | null = null
  if (parsed) incomeCents = parsed.totalMonthlyCents
  else if (body.gross_monthly_income) incomeCents = Math.round(Number.parseFloat(body.gross_monthly_income) * 100)
  return {
    first_name: body.first_name ?? null, last_name: body.last_name ?? null, applicant_phone: body.phone ?? null,
    // id_type + employment_type carry DB CHECK constraints — an empty string (saving before they're picked)
    // would VIOLATE the check, so coerce ""→null (NULL passes the check; a partial draft is allowed).
    id_type: body.id_type || null, id_number: body.id_number ?? null, date_of_birth: body.date_of_birth || null,
    employment_type: body.employment_type || null, employer_name: body.employer_name ?? null,
    employment_start_date: body.employment_start_date || null,
    gross_monthly_income_cents: incomeCents, income_sources: parsed?.rows ?? null,
    // applicant's current address(es) — bounded (array, cap 5) since it's public input; stored as-is for resume.
    applicant_addresses: Array.isArray(body.addresses) ? body.addresses.slice(0, 5) : null,
    draft_step: typeof body.step === "number" ? body.step : null,
    draft_saved_at: new Date().toISOString(),
  }
}

/** Email the resume link — resolves listing/org context by application id so it works on BOTH the create and
 *  update path. AWAITED on the explicit-save path so the dangling promise isn't dropped when the route returns;
 *  returns whether it actually sent (+ the error) so the response/modal can be honest about delivery. */
async function sendResumeEmail(db: Db, appId: string, email: string, firstName: string | undefined, url: string): Promise<{ sent: boolean; error?: string }> {
  try {
    const { data: app, error: appErr } = await db.from("applications")
      .select("org_id, listings(units(unit_number, properties(name, city)))")
      .eq("id", appId).maybeSingle()
    logQueryError("save-draft email context", appErr)
    if (!app) return { sent: false, error: "application not found" }
    const orgId = app.org_id as string
    const { data: org, error: orgErr } = await db.from("organisations").select("name, email, phone").eq("id", orgId).single()
    logQueryError("save-draft org branding", orgErr)
    const branding = buildBranding(await fetchOrgSettings(orgId))
    const unit = (app.listings as unknown as { units?: { unit_number?: string | null; properties?: { name?: string | null; city?: string | null } | null } | null })?.units
    const result = await sendApplicationResumeLink(
      { email, firstName },
      { unitLabel: unit?.unit_number ?? "the unit", propertyName: unit?.properties?.name ?? "the property", city: unit?.properties?.city ?? undefined },
      { orgId, orgName: org?.name ?? "Pleks", orgEmail: org?.email ?? undefined, orgPhone: org?.phone ?? undefined, branding },
      { resumeUrl: url, applicationId: appId },
    )
    if (!result?.success) console.error("[save-draft] resume email not sent:", result?.error)
    return { sent: !!result?.success, error: result?.error }
  } catch (e) {
    console.error("[save-draft] sendApplicationResumeLink threw:", e)
    return { sent: false, error: e instanceof Error ? e.message : "send failed" }
  }
}

interface ListingRow {
  id: string; org_id: string; unit_id: string | null
  units: { unit_number: string | null; assigned_agent_id: string | null; properties: { name: string | null; city: string | null; managing_agent_id: string | null } | null } | null
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`app-save-draft:${getClientIp(req)}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const body = await req.json().catch(() => ({})) as Body
  if (!body.slug) return NextResponse.json({ error: "Missing listing" }, { status: 400 })
  const db = getServiceClient()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  const fields = draftFields(body)

  // ── Update an existing draft (token bound to THIS id) + extend the token ──
  if (body.applicationId && body.token) {
    const { data: tok, error: tokErr } = await db.from("application_tokens")
      .select("id").eq("token", body.token).eq("application_id", body.applicationId).maybeSingle()
    logQueryError("save-draft token", tokErr)
    if (!tok) return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    const { error: upErr } = await db.from("applications").update(fields).eq("id", body.applicationId)
    logQueryError("save-draft update", upErr)
    const { error: extErr } = await db.from("application_tokens").update({ expires_at: expiresAt }).eq("token", body.token)
    logQueryError("save-draft token extend", extErr)
    const updUrl = resumeUrl(req, body.slug, body.applicationId, body.token)
    let updEmail: { sent: boolean; error?: string } = { sent: false }
    if (body.notify && body.email) updEmail = await sendResumeEmail(db, body.applicationId, body.email, body.first_name, updUrl)
    return NextResponse.json({ applicationId: body.applicationId, token: body.token, resumeUrl: updUrl, emailed: updEmail.sent, emailError: updEmail.error })
  }

  // ── Create a new draft (email required to send the resume link) ──
  if (!body.email) return NextResponse.json({ error: "An email is required to save your progress." }, { status: 400 })
  const { data: listing, error: listErr } = await db.from("listings")
    .select("id, org_id, unit_id, units(unit_number, assigned_agent_id, properties(name, city, managing_agent_id))")
    .eq("public_slug", body.slug).eq("status", "active").maybeSingle()
  logQueryError("save-draft listing", listErr)
  if (!listing) return NextResponse.json({ error: "Listing not found or no longer active" }, { status: 404 })
  const l = listing as unknown as ListingRow
  const routedAgent = l.units?.assigned_agent_id ?? l.units?.properties?.managing_agent_id ?? null

  const { data: appRow, error: insErr } = await db.from("applications").insert({
    org_id: l.org_id, listing_id: l.id, unit_id: l.unit_id,
    applicant_email: body.email, stage1_status: "pending_documents",
    assigned_user_id: routedAgent, assigned_at: routedAgent ? new Date().toISOString() : null,
    ...fields,
  }).select("id").single()
  logQueryError("save-draft insert", insErr)
  if (!appRow) return NextResponse.json({ error: "Could not save your progress." }, { status: 500 })

  const token = randomBytes(32).toString("hex")
  const { error: tokInsErr } = await db.from("application_tokens").insert({
    application_id: appRow.id, token, token_type: "application", applicant_email: body.email, expires_at: expiresAt,
  })
  logQueryError("save-draft token insert", tokInsErr)

  const url = resumeUrl(req, body.slug, appRow.id, token)
  // Email ONLY on an explicit "Save & finish later" — advancing through the wizard upserts silently. Awaited so
  // the send completes before the response (a dropped fire-and-forget promise was why no email arrived).
  let email: { sent: boolean; error?: string } = { sent: false }
  if (body.notify) email = await sendResumeEmail(db, appRow.id, body.email, body.first_name, url)

  return NextResponse.json({ applicationId: appRow.id, token, resumeUrl: url, emailed: email.sent, emailError: email.error })
}
