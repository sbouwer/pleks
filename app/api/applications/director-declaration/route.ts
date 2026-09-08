/**
 * app/api/applications/director-declaration/route.ts — Step 1.5 submit for a commercial application
 *
 * Route:  POST /api/applications/director-declaration
 * Auth:   application_tokens (token_type='application') bound to this application — LEAD token only
 * Data:   applications (read: org marker, company_info, primary-contact identity) →
 *         declareDirectors() writes application_directors + application_co_applicants
 * Notes:  ADDENDUM_14G §3.4 / §7.2. Deliberately NARROWER than declareDirectors' own gate:
 *         verifyApplicantToken accepts a co-applicant access_token too (the 14R peer model), so a
 *         surety director could otherwise declare the board they sit on. §3.1 says the primary
 *         contact declares it, and the lead-token check below is what makes that true — the page's
 *         gate is not the boundary, this is.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber } from "@/lib/crypto/idNumber"
import { declareDirectors, type DirectorDeclaration } from "@/lib/applications/commercial"
import { orgMarkerFrom, requiresSuretyParty, validateJuristicParties } from "@/lib/applications/juristicParties"

interface DirectorInput {
  firstName?: string
  lastName?: string
  idNumber?: string
  email?: string
  phone?: string
  isSigningSurety?: boolean
}

/** Cap on declared directors — a form, not an import path. Wide enough for any real SA board. */
const MAX_DIRECTORS = 20

export async function POST(req: NextRequest) {
  const body = await req.json() as { applicationId?: string; token?: string; directors?: DirectorInput[] }
  const { applicationId, token } = body
  const declared = Array.isArray(body.directors) ? body.directors : []

  if (!applicationId || !token || declared.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }
  if (declared.length > MAX_DIRECTORS) {
    return NextResponse.json({ error: `At most ${MAX_DIRECTORS} directors can be declared here.` }, { status: 400 })
  }

  const service = await createServiceClient()

  // LEAD credential only. Bound to this applicationId and unexpired — the token is the proof of which
  // application may be acted on, and everything below is read FROM that application rather than
  // accepted alongside it.
  const { data: lead, error: leadErr } = await service
    .from("application_tokens")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- this read IS the credential check; the token is the secret and there is no caller org to scope by yet. Returns only application_id, which is already the caller-supplied value it is being matched against.
    .select("application_id")
    .eq("token", token)
    .eq("application_id", applicationId)
    .eq("token_type", "application")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  logQueryError("POST director-declaration application_tokens", leadErr)

  if (!lead) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  // This read ESTABLISHES the org rather than being scoped by it — the token above pins `id`.
  const { data: application, error: appErr } = await service
    .from("applications")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bounded by the lead token verified immediately above, which pins this exact application id; there is no caller org to scope by on a public applicant surface
    .select("id, entity_type, applicant_type, company_info, first_name, last_name, applicant_email, applicant_phone, id_number")
    .eq("id", applicationId)
    .maybeSingle()
  logQueryError("POST director-declaration applications", appErr)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const companyType = (application.company_info as Record<string, unknown> | null)?.companyType
  const orgMarker = orgMarkerFrom(application.entity_type, application.applicant_type)

  // Individual applications 404 here (14G §3.1) — the route does not exist for them.
  if (!requiresSuretyParty(orgMarker, companyType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Idempotency. Directors are billable lines: a double submit would create a second set of
  // co-applicant rows, each with its own fee, and the payment page would total both. Refusing is
  // right rather than upserting — declaring a board twice is a mistake, not an edit.
  const { count: existing, error: existingErr } = await service
    .from("application_directors")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bounded to the application the lead token proved; head-count only, no row content leaves this handler
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
  logQueryError("POST director-declaration application_directors", existingErr)

  if ((existing ?? 0) > 0) {
    return NextResponse.json(
      { error: "Directors have already been declared for this application.", code: "already_declared" },
      { status: 409 },
    )
  }

  // Director 1's identity comes from the APPLICATION, not from the request. The form locks those
  // fields; a locked field in a browser is a styling choice, so the server re-derives them. Only the
  // surety tick is the primary contact's to make (§3.3 — the "authorised representative" case).
  const primaryDirector: DirectorDeclaration = {
    firstName: application.first_name ?? "",
    lastName: application.last_name ?? "",
    idNumber: decryptIdNumber(application.id_number) ?? undefined,
    email: application.applicant_email ?? "",
    phone: application.applicant_phone ?? undefined,
    isSigningSurety: declared[0]?.isSigningSurety !== false,
    isPrimaryContact: true,
  }

  const others: DirectorDeclaration[] = []
  for (const d of declared.slice(1)) {
    const firstName = (d.firstName ?? "").trim()
    const lastName = (d.lastName ?? "").trim()
    const email = (d.email ?? "").trim().toLowerCase()
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Every director needs a first name, last name and email address." }, { status: 400 })
    }
    others.push({
      firstName,
      lastName,
      email,
      idNumber: (d.idNumber ?? "").trim() || undefined,
      phone: (d.phone ?? "").trim() || undefined,
      isSigningSurety: d.isSigningSurety === true,
    })
  }

  const directors = [primaryDirector, ...others]

  if (!primaryDirector.firstName || !primaryDirector.email) {
    return NextResponse.json({ error: "The application is missing the primary contact's details." }, { status: 400 })
  }

  // Duplicate emails would produce two screening lines for one human, each separately payable.
  const emails = directors.map((d) => d.email.toLowerCase())
  if (new Set(emails).size !== emails.length) {
    return NextResponse.json({ error: "Each director needs their own email address." }, { status: 400 })
  }

  // The MIN_SURETY_PARTIES gate, applied at declaration rather than at payment. Refusing here means
  // the applicant is told what is wrong while they are looking at the form, not at a card reader.
  const gate = validateJuristicParties({
    entityType: orgMarker,
    companyType,
    suretyCount: directors.filter((d) => d.isSigningSurety).length,
  })
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, code: "surety_party_required" }, { status: 409 })
  }

  const result = await declareDirectors(applicationId, directors, token)

  if (result.directors.length === 0) {
    return NextResponse.json({ error: "Failed to record the directors. Please try again." }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    nextStep: "company-payment",
    declared: result.directors.length,
    invited: result.invited,
  })
}
