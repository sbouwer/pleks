/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/payment/page.tsx — a party's own screening fee payment
 *
 * Route:  /apply/[slug]/director-portal/[token]/payment
 * Auth:   application_co_applicants.access_token lookup
 * Data:   application_co_applicants; the line's application_screening_payments row, stamped at first show through
 *         lib/screening/lineFee.ts (searchworx_rates via lib/screening/quote.ts); buildDirectorFeeForm
 * Notes:  ADDENDUM_14W §0: the per-line pay step for EVERY co party — a surety on a juristic application, and a
 *         co-applicant or guarantor on a residential one. The token is the party's own, and the page is role-agnostic.
 *         CONSENT FIRST: no form is built until this party's own stage-2 consent is recorded; the party is sent to
 *         their consent step instead (a surety's director-portal consent, everyone else's co-applicant link).
 *         Redirects to the status page once paid. The notify_url is /api/webhooks/payfast/director, which marks this
 *         line's stamped row paid.
 */
import { notFound, redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { stampLineFee } from "@/lib/screening/lineFee"
import { buildDirectorFeeForm } from "@/lib/payfast/forms"
import { isJuristicForCopy, partyKind } from "@/lib/applications/juristicParties"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PayFastForm } from "@/components/payfast/PayFastForm"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { windowOpen } from "@/lib/screening/window"

function ScreeningUnavailable() {
  return (
    <div className="space-y-4 text-center py-12">
      <p className="text-sm text-muted-foreground">
        Screening is temporarily unavailable. Please try again later.
      </p>
    </div>
  )
}

export default async function DirectorPaymentPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string; token: string }>
}>) {
  const { slug, token } = await params
  const service = await createServiceClient()
  const base = `/apply/${slug}/director-portal/${token}`

  const { data: coApp, error } = await service
    .from("application_co_applicants")
    .select("id, first_name, last_name, primary_application_id, access_token_expires, declined_at, org_id, stage2_consent_given_at, stage2_invited_at, role, is_surety_director, declared_director")
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (error || !coApp) notFound()

  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    redirect(base)
  }
  // The pay form lives inside the party's own window and nowhere else (14W §0b walker F3). A co party's token outlives
  // the window (its column default is 30 days), so the token check alone let a form be opened after the deadline —
  // and paid into a line the reminders cron was about to decline. The landing explains either state.
  if (!coApp.stage2_invited_at || !windowOpen(coApp.stage2_invited_at as string)) {
    redirect(base)
  }

  // Fetch the application for display context and the party's invite route.
  const { data: app, error: appError } = await service
    .from("applications")
    .select("entity_type, applicant_type, company_info, listings(units(unit_number, properties(name)))")
    .eq("id", coApp.primary_application_id)
    .eq("org_id", coApp.org_id as string)
    .single()
    logQueryError("DirectorPaymentPage applications", appError)

  // 14W §0: never pay before consent. A surety consents on the director portal; a co-applicant or guarantor on their
  // own co-applicant link. Same token either way.
  if (!coApp.stage2_consent_given_at) {
    const surety = !!app && partyKind({ party: coApp, isJuristic: isJuristicForCopy(app) }) === "surety"
    redirect(surety ? `${base}/consent` : `/apply/co-applicant/${token}`)
  }

  const listing = app?.listings as unknown as {
    units: { unit_number: string; properties: { name: string } }
  } | null

  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"

  const fee = await stampLineFee(service, {
    orgId: coApp.org_id as string,
    applicationId: coApp.primary_application_id as string,
    subjectType: "co_applicant",
    subjectId: coApp.id as string,
  }, "director-payment")
  if (!fee.ok && fee.reason === "paid") redirect(`${base}/status`)
  if (!fee.ok) return <ScreeningUnavailable />
  const payerName = [coApp.first_name, coApp.last_name].filter(Boolean).join(" ") || "Applicant"

  const { url, data: formData } = buildDirectorFeeForm({
    applicationId:  coApp.primary_application_id,
    coApplicantId:  coApp.id,
    orgId:          coApp.org_id as string,
    slug,
    token,
    feeCents:       fee.cents,
    directorName:   payerName,
    propertyLabel,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pay your screening fee</h1>
        <p className="text-sm text-muted-foreground mt-1">{propertyLabel}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your screening (your own check)</span>
            <span className="font-semibold">{formatZAR(fee.cents)}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p>Covers: credit check, identity verification, income verification, adverse listing checks.</p>
            <p>You will receive your own Consumer Report by email once complete.</p>
            <p>The screening service commences upon successful payment.</p>
          </div>
        </CardContent>
      </Card>

      <PayFastForm url={url} data={formData} label={`Pay ${formatZAR(fee.cents)} securely →`} />

      <p className="text-xs text-center text-muted-foreground">
        Payments are processed securely via PayFast. Pleks does not store your card details.
      </p>
    </div>
  )
}
