/**
 * app/(applicant)/apply/[slug]/directors/page.tsx — Step 1.5, the director declaration
 *
 * Route:  /apply/[slug]/directors?token=[application_token]
 * Auth:   application_tokens (token_type='application') bound to this application — LEAD token only
 * Data:   applications (org marker, company_info, primary-contact identity, listing label)
 * Notes:  ADDENDUM_14G §3. The board a commercial applicant declares here is what the surety gate
 *         and the fee both count, so this page is the missing writer of `is_surety_director`.
 *
 *         ⚠ TWO DEVIATIONS FROM 14G §3, both deliberate and both flagged in the build report:
 *         (1) §3.1 gates on `applications.entity_type='organisation'`. Nothing writes that column —
 *             it carries a DEFAULT of 'individual' and has zero writers (M-108) — so that gate would
 *             404 every application the live flow produces. Gated instead on `orgMarkerFrom`, the
 *             resolver over BOTH markers, which juristicParties has accepted by design since 14B.
 *         (2) §3.4(6) redirects to /company-payment/[token], which is 14G Phase 4 and not built.
 *             Redirects to /co-parties?token= until it exists — see DirectorDeclarationForm.
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, maskIdNumber } from "@/lib/crypto/idNumber"
import { orgMarkerFrom, requiresSuretyParty, suretyPartyLabel } from "@/lib/applications/juristicParties"
import { DirectorDeclarationForm } from "./DirectorDeclarationForm"

export default async function DirectorsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}>) {
  const { slug } = await params
  const { token } = await searchParams

  if (!token) notFound()

  const service = await createServiceClient()

  // LEAD token only. A surety director holds a co-applicant access_token that verifyApplicantToken
  // would accept (the 14R peer model); declaring the board they sit on is the primary contact's act.
  const { data: tokenRow, error: tokenErr } = await service
    .from("application_tokens")
    .select("application_id, expires_at")
    .eq("token", token)
    .eq("token_type", "application")
    .maybeSingle()
  logQueryError("DirectorsPage application_tokens", tokenErr)

  if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) notFound()

  const applicationId = tokenRow.application_id

  // Establishes the org rather than being scoped by it — the token above pins the id.
  const { data: application, error: appErr } = await service
    .from("applications")
    // Bounded by the lead token verified immediately above, which pins this exact application id.
    // No `.eq("org_id", …)`: this read is what ESTABLISHES the org, and a public applicant surface
    // has no caller org to assert against. (`require-org-scope-on-service-read` does not reach
    // `app/(applicant)/**` today, so the reason is recorded here rather than as a directive.)
    .select("id, entity_type, applicant_type, company_info, first_name, last_name, applicant_email, applicant_phone, id_number, listings(units(unit_number, properties(name, address_line1, city)))")
    .eq("id", applicationId)
    .maybeSingle()
  logQueryError("DirectorsPage applications", appErr)

  if (!application) notFound()

  const companyInfo = application.company_info as Record<string, unknown> | null
  const companyType = companyInfo?.companyType
  const orgMarker = orgMarkerFrom(application.entity_type, application.applicant_type)

  // §3.1 — individual applications have no board to declare and 404 here.
  if (!requiresSuretyParty(orgMarker, companyType)) notFound()

  // Already declared → the form would 409. Send them on rather than showing a dead form.
  const { count: declared, error: declaredErr } = await service
    .from("application_directors")
    // Bounded to the application the lead token proved; head-count only, no row content is read.
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
  logQueryError("DirectorsPage application_directors", declaredErr)

  const listing = application.listings as unknown as {
    units: { unit_number: string; properties: { name: string; address_line1: string | null; city: string | null } }
  } | null
  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "this property"

  const companyName =
    (typeof companyInfo?.name === "string" && companyInfo.name.trim()) ||
    (typeof companyInfo?.trading === "string" && companyInfo.trading.trim()) ||
    "Your company"

  // The primary contact's ID is decrypted only to be MASKED — the locked field shows them enough to
  // recognise the record, and the raw value never reaches the browser. The server re-derives the real
  // one from the application row when the declaration is submitted.
  const primaryIdMasked = (() => {
    const raw = decryptIdNumber(application.id_number)
    return raw ? maskIdNumber(raw) : ""
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Director information</h1>
        <p className="text-sm text-muted-foreground mt-1">{propertyLabel}</p>
      </div>

      <DirectorDeclarationForm
        applicationId={applicationId}
        token={token}
        slug={slug}
        companyName={companyName}
        companyType={typeof companyType === "string" ? companyType : null}
        partyLabel={suretyPartyLabel(companyType)}
        alreadyDeclared={(declared ?? 0) > 0}
        primary={{
          firstName: application.first_name ?? "",
          lastName: application.last_name ?? "",
          email: application.applicant_email ?? "",
          idMasked: primaryIdMasked,
        }}
      />
    </div>
  )
}
