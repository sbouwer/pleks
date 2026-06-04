/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/consent/page.tsx — Director POPIA consent step
 *
 * Route:  /apply/[slug]/director-portal/[token]/consent
 * Auth:   application_co_applicants.access_token lookup
 * Data:   application_co_applicants — updates stage2_consent_given_at via director-consent API
 * Notes:  D-14B-01: each director must consent individually. ADDENDUM_14F: consent is now
 *         two-step (tick + SMS verification). hasPhone passed to form; if false, SMS skipped.
 */
import { notFound, redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DirectorConsentForm } from "./DirectorConsentForm"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function DirectorConsentPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string; token: string }>
}>) {
  const { slug, token } = await params
  const service = await createServiceClient()

  const { data: coApp, error } = await service
    .from("application_co_applicants")
    .select("id, first_name, applicant_phone, primary_application_id, stage2_consent_given_at, access_token_expires, declined_at")
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (error || !coApp) notFound()

  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    redirect(`/apply/${slug}/director-portal/${token}`)
  }

  if (coApp.stage2_consent_given_at) {
    redirect(`/apply/${slug}/director-portal/${token}`)
  }

  const { data: app, error: appError } = await service
    .from("applications")
    .select("listings(units(unit_number, properties(name, address_line1, city)))")
    .eq("id", coApp.primary_application_id)
    .single()
    logQueryError("DirectorConsentPage applications", appError)

  const listing = app?.listings as unknown as {
    units: { unit_number: string; properties: { name: string; address_line1: string | null; city: string | null } }
  } | null

  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"
  const address = listing?.units?.properties
    ? [listing.units.properties.address_line1, listing.units.properties.city].filter(Boolean).join(", ")
    : ""

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Consent to screening</h1>
        <p className="text-sm text-muted-foreground mt-1">{propertyLabel}{address ? ` — ${address}` : ""}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you are consenting to</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            By consenting below, you authorise the leasing agency to process your personal information
            for the purpose of evaluating your personal surety for this lease application.
          </p>
          <p>This includes:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Credit bureau enquiry (TransUnion Consumer Portfolio)</li>
            <li>Identity verification (Trace)</li>
            <li>Income and bank statement verification</li>
            <li>Adverse / default listing checks</li>
          </ul>
          <p>
            Your results will be shared only with the leasing agent for this application.
            They will not be shared with other applicants or directors.
            You have the right to access, correct, or delete your information under POPIA.
          </p>
          <p className="text-xs">
            This consent covers Standard bundle checks. If the property requires an Estate bundle,
            you will be asked for additional consent for criminal history screening (Huru Criminal Standard).
          </p>
        </CardContent>
      </Card>

      <DirectorConsentForm
        coApplicantId={coApp.id}
        token={token}
        slug={slug}
        firstName={coApp.first_name}
        hasPhone={!!coApp.applicant_phone}
      />
    </div>
  )
}
