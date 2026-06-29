/**
 * app/api/applications/save-draft/route.ts — save & resume a draft application (ADDENDUM_14M follow-on).
 *
 * Route:  POST /api/applications/save-draft
 * Auth:   PUBLIC / UNAUTHENTICATED. A "draft" is an applications row not yet submitted to the agent
 *         (submitted_at IS NULL) — no separate PII store. org_id is derived SERVER-SIDE from slug → listing. Update is
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
import { encryptIdNumber, encryptDob, encryptSpouseInfo } from "@/lib/crypto/idNumber"
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
  employment_details?: Record<string, unknown> | null
  dependents?: number | null
  dependent_adults?: number | null; dependent_minors?: number | null; school_fees?: number | null
  gross_monthly_income?: string; income_sources?: unknown
  declared_monthly_obligations?: number | null; expenses?: unknown
  addresses?: unknown
  applicant_type?: string; company_info?: unknown
  marital_status?: string; matrimonial_regime?: string; spouse_info?: unknown
  /** the filler finished their own section (documents) — set stage1_status server-side (the applicant isn't authed,
   *  so a browser-client table write is unreliable under RLS). Drives the hub's "Completed" + resume restore. */
  documentsSubmitted?: boolean
  /** the filler gave POPIA consent at their section sign-off (per-member consent) — record it server-side, once. */
  consentGiven?: boolean
  /** the company section was signed off (co-review complete) — persist company_info.signedOff so the hub reads
   *  Completed on resume even after an edit moves the cursor back. */
  companySignedOff?: boolean
}

const APPLICANT_TYPES = ["individual", "couple", "company", "guarantor"]

const resumeUrl = (req: NextRequest, slug: string, id: string, token: string) =>
  `${req.nextUrl.origin}/apply/${slug}?app=${id}&token=${encodeURIComponent(token)}`

/** Record the filler's POPIA consent at their SECTION sign-off (per-member consent, ADDENDUM_14Q) — once. Returns the
 *  applications fields to set; writes the consent_log row. Guarded so re-finishing an edited section never duplicates.
 *  Scope matches /submit (covers the Step-2 AI document analysis, so the deep scan at shortlist is consented now). */
async function recordSectionConsent(db: Db, applicationId: string, bodyEmail: string | undefined, ip: string | null): Promise<Record<string, unknown>> {
  const { data: capp, error } = await db.from("applications").select("org_id, applicant_email, stage1_consent_given").eq("id", applicationId).maybeSingle()
  logQueryError("save-draft consent load", error)
  if (!capp || capp.stage1_consent_given === true) return {}
  const { error: clErr } = await db.from("consent_log").insert({
    org_id: capp.org_id as string,
    subject_email: (capp.applicant_email as string | null) ?? bodyEmail ?? null,
    consent_type: "popia_application", consent_given: true,
    ip_address: ip,
    metadata: { application_id: applicationId, scope: "stage1_prescreen_and_ai_document_analysis" },
  })
  logQueryError("save-draft consent_log", clErr)
  return { stage1_consent_given: true, stage1_consent_given_at: new Date().toISOString(), stage1_consent_ip: ip }
}

/** If the applicant changed their email, persist it AND invalidate any prior email verification (the anti-bot gate
 *  must re-verify the new address — else verify A, switch to B, submit B unverified). Returns fields to set. */
async function applyEmailChange(db: Db, applicationId: string, bodyEmail: string): Promise<Record<string, unknown>> {
  const { data: cur, error } = await db.from("applications").select("applicant_email").eq("id", applicationId).maybeSingle()
  logQueryError("save-draft current email", error)
  if (cur && bodyEmail !== cur.applicant_email) return { applicant_email: bodyEmail, email_verified_at: null }
  return {}
}

/** Map the partial body → the application columns we persist (only what's filled). */
function draftFields(body: Body) {
  const parsed = parseIncomeSources(body.income_sources)
  const parsedExpenses = parseIncomeSources(body.expenses)
  let incomeCents: number | null = null
  if (parsed) incomeCents = parsed.totalMonthlyCents
  else if (body.gross_monthly_income) incomeCents = Math.round(Number.parseFloat(body.gross_monthly_income) * 100)
  return {
    first_name: body.first_name ?? null, last_name: body.last_name ?? null, applicant_phone: body.phone ?? null,
    // id_type + employment_type carry DB CHECK constraints — an empty string (saving before they're picked)
    // would VIOLATE the check, so coerce ""→null (NULL passes the check; a partial draft is allowed).
    id_type: body.id_type || null, id_number: encryptIdNumber(body.id_number), date_of_birth: encryptDob(body.date_of_birth),
    employment_type: body.employment_type || null, employer_name: body.employer_name ?? null,
    employment_start_date: body.employment_start_date || null,
    employment_details: body.employment_details && typeof body.employment_details === "object" ? body.employment_details : null,
    gross_monthly_income_cents: incomeCents, income_sources: parsed?.rows ?? null,
    dependents_count: typeof body.dependents === "number" && Number.isFinite(body.dependents) ? Math.max(0, Math.trunc(body.dependents)) : null,
    dependent_adults_count: typeof body.dependent_adults === "number" && Number.isFinite(body.dependent_adults) ? Math.max(0, Math.trunc(body.dependent_adults)) : null,
    dependent_minors_count: typeof body.dependent_minors === "number" && Number.isFinite(body.dependent_minors) ? Math.max(0, Math.trunc(body.dependent_minors)) : null,
    school_fees_cents: typeof body.school_fees === "number" && Number.isFinite(body.school_fees) ? Math.max(0, Math.round(body.school_fees * 100)) : null,
    declared_monthly_obligations_cents: typeof body.declared_monthly_obligations === "number" && Number.isFinite(body.declared_monthly_obligations) ? Math.max(0, Math.round(body.declared_monthly_obligations * 100)) : null,
    expenses: parsedExpenses?.rows ?? null,
    // applicant's current address(es) — bounded (array, cap 5) since it's public input; stored as-is for resume.
    applicant_addresses: Array.isArray(body.addresses) ? body.addresses.slice(0, 5) : null,
    // chosen application type + company details — so resume restores the exact flow (not inferred).
    applicant_type: typeof body.applicant_type === "string" && APPLICANT_TYPES.includes(body.applicant_type) ? body.applicant_type : null,
    company_info: body.company_info && typeof body.company_info === "object" ? body.company_info : null,
    marital_status: body.marital_status || null,
    matrimonial_regime: body.matrimonial_regime || null,
    spouse_info: encryptSpouseInfo(body.spouse_info as Record<string, unknown> | null), // encrypt the spouse's id at rest
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
    // If the applicant changed their email, persist it AND invalidate any prior email verification (the
    // anti-bot gate must re-verify the new address — else verify A, switch to B, submit B unverified).
    const updateFields: Record<string, unknown> = { ...fields }
    // The filler finished their own section → mark documents_submitted (server-side; the unauthenticated applicant
    // can't reliably set it via the browser client). This is what the hub + resume read as "Completed".
    if (body.documentsSubmitted) updateFields.stage1_status = "documents_submitted"
    // Company sign-off → persist company_info.signedOff so the hub reads Completed on resume even after an edit
    // moves the draft_step cursor back into the company panes (the heuristic can't tell edited from unfinished).
    if (body.companySignedOff && fields.company_info && typeof fields.company_info === "object")
      updateFields.company_info = { ...(fields.company_info as Record<string, unknown>), signedOff: true }
    if (body.consentGiven) Object.assign(updateFields, await recordSectionConsent(db, body.applicationId, body.email, getClientIp(req)))
    if (body.email) Object.assign(updateFields, await applyEmailChange(db, body.applicationId, body.email))
    const { error: upErr } = await db.from("applications").update(updateFields).eq("id", body.applicationId)
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

  // Dedup keys off submitted_at (the real submission), NOT consent — merely pre-screening doesn't count as
  // applying. Block only if a SUBMITTED application already exists (the partial unique index is the backstop).
  const { data: submitted, error: subErr } = await db.from("applications")
    .select("id").eq("listing_id", l.id).ilike("applicant_email", body.email)
    .not("submitted_at", "is", null).is("deleted_at", null).limit(1).maybeSingle()
  logQueryError("save-draft submitted check", subErr)
  if (submitted) {
    return NextResponse.json({ error: "You've already applied for this unit.", code: "already_applied" }, { status: 409 })
  }
  // Otherwise resume the latest non-submitted draft for this email+listing (apply the edits) instead of duplicating.
  const { data: existing, error: exErr } = await db.from("applications")
    .select("id").eq("listing_id", l.id).ilike("applicant_email", body.email)
    .is("submitted_at", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("save-draft draft check", exErr)
  if (existing) {
    const reToken = randomBytes(32).toString("hex")
    await db.from("applications").update(fields).eq("id", existing.id as string)
    const { error: rtErr } = await db.from("application_tokens").insert({
      application_id: existing.id as string, token: reToken, token_type: "application", applicant_email: body.email, expires_at: expiresAt,
    })
    logQueryError("save-draft dedup token", rtErr)
    return NextResponse.json({ applicationId: existing.id, token: reToken, resumeUrl: resumeUrl(req, body.slug, existing.id as string, reToken) })
  }

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
