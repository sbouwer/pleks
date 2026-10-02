/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/payment/page.tsx — Director screening fee payment
 *
 * Route:  /apply/[slug]/director-portal/[token]/payment
 * Auth:   application_co_applicants.access_token lookup
 * Data:   application_co_applicants (stamps individual_fee_cents once), application_screening_payments,
 *         searchworx_rates via lib/screening/quote.ts, buildDirectorFeeForm
 * Notes:  Redirects back to portal landing if already paid. Renders a PayFast payment form.
 *         The notify_url is /api/webhooks/payfast/director which creates the screening_payments row.
 */
import { notFound, redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { quoteApplicationFee } from "@/lib/screening/quote"
import { buildDirectorFeeForm } from "@/lib/payfast/forms"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PayFastForm } from "@/components/payfast/PayFastForm"
import { logQueryError } from "@/lib/supabase/logQueryError"

/**
 * STAMP AT FIRST SHOW (ADDENDUM_14V §3.5): this page builds the PayFast form, so it is the director's first show.
 * individual_fee_cents is the stamp — written once (guarded on null), reused after, and the director ITN reads it
 * with no fallback. A director is priced as one natural person on the SA bundle. null = no fee could be stamped.
 */
async function stampDirectorFee(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  coApplicantId: string,
  orgId: string,
): Promise<number | null> {
  const q = await quoteApplicationFee({ juristic: false, persons: 1 }, "director-payment")
  if (!q.ok) return null
  const { data: stamped, error: stampError } = await service
    .from("application_co_applicants")
    .update({ individual_fee_cents: q.fee_cents })
    .eq("id", coApplicantId)
    .eq("org_id", orgId)
    .is("individual_fee_cents", null)
    .select("individual_fee_cents")
  logQueryError("DirectorPaymentPage individual_fee_cents stamp", stampError)
  if (stampError) return null
  if (stamped && stamped.length > 0) return q.fee_cents
  // A concurrent render stamped first — its number stands.
  const { data: winner, error: winnerError } = await service
    .from("application_co_applicants").select("individual_fee_cents")
    .eq("id", coApplicantId).eq("org_id", orgId).single()
  logQueryError("DirectorPaymentPage individual_fee_cents re-read", winnerError)
  return typeof winner?.individual_fee_cents === "number" ? winner.individual_fee_cents : null
}

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

  const { data: coApp, error } = await service
    .from("application_co_applicants")
    .select("id, first_name, last_name, primary_application_id, individual_fee_cents, access_token_expires, declined_at, org_id")
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (error || !coApp) notFound()

  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    redirect(`/apply/${slug}/director-portal/${token}`)
  }

  // Check if already paid
  const { data: existingPayment, error: existingPaymentError } = await service
    .from("application_screening_payments")
    .select("paid_at")
    .eq("application_id", coApp.primary_application_id)
    .eq("subject_type", "co_applicant")
    .eq("subject_id", coApp.id)
    .maybeSingle()
    logQueryError("DirectorPaymentPage application_screening_payments", existingPaymentError)

  if (existingPayment?.paid_at) {
    redirect(`/apply/${slug}/director-portal/${token}`)
  }

  // Fetch listing for display context
  const { data: app, error: appError } = await service
    .from("applications")
    .select("listings(units(unit_number, properties(name)))")
    .eq("id", coApp.primary_application_id)
    .single()
    logQueryError("DirectorPaymentPage applications", appError)

  const listing = app?.listings as unknown as {
    units: { unit_number: string; properties: { name: string } }
  } | null

  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"

  const feeCents = typeof coApp.individual_fee_cents === "number"
    ? coApp.individual_fee_cents
    : await stampDirectorFee(service, coApp.id, coApp.org_id as string)
  if (feeCents === null) return <ScreeningUnavailable />
  const directorName = [coApp.first_name, coApp.last_name].filter(Boolean).join(" ") || "Director"

  const { url, data: formData } = buildDirectorFeeForm({
    applicationId:  coApp.primary_application_id,
    coApplicantId:  coApp.id,
    orgId:          coApp.org_id as string,
    slug,
    token,
    feeCents,
    directorName,
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
            <span className="text-muted-foreground">Director screening (personal surety)</span>
            <span className="font-semibold">{formatZAR(feeCents)}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p>Covers: credit check, identity verification, income verification, adverse listing checks.</p>
            <p>You will receive your own Consumer Report by email once complete.</p>
          </div>
        </CardContent>
      </Card>

      <PayFastForm url={url} data={formData} label={`Pay ${formatZAR(feeCents)} securely →`} />

      <p className="text-xs text-center text-muted-foreground">
        Payments are processed securely via PayFast. Pleks does not store your card details.
      </p>
    </div>
  )
}
