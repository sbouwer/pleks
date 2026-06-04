/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/page.tsx — Director portal landing page
 *
 * Route:  /apply/[slug]/director-portal/[token]
 * Auth:   application_co_applicants.access_token lookup — director's private token
 * Data:   application_co_applicants, applications, application_screening_payments
 * Notes:  Each director accesses only their own row — POPIA per-data-subject isolation.
 *         Director portal flow is Consent → Payment only. Searchworx handles document
 *         collection post-consent; there is no in-portal document upload step.
 *         Token is single-purpose per director; cannot see other directors' data.
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import Link from "next/link"
import { CheckCircle2, Clock, Circle } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface DirectorPortalData {
  firstName: string | null
  propertyLabel: string
  feeCents: number
  consentGiven: boolean
  paymentPaid: boolean
  checksComplete: boolean
  token: string
  slug: string
}

export default async function DirectorPortalPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string; token: string }>
}>) {
  const { slug, token } = await params
  const service = await createServiceClient()

  // Validate director token
  const { data: coApp, error: coErr } = await service
    .from("application_co_applicants")
    .select("id, first_name, primary_application_id, individual_fee_cents, stage2_consent_given_at, searchworx_check_status, access_token_expires, declined_at")
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) notFound()

  // Check token expiry
  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="text-center py-8 space-y-3">
            <Clock className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">Your invite has expired</h1>
            <p className="text-sm text-muted-foreground">
              This director link has expired. Please ask the primary applicant to resend your invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch application + listing context
  const { data: app, error: appError } = await service
    .from("applications")
    .select("listings(public_slug, units(unit_number, properties(name)))")
    .eq("id", coApp.primary_application_id)
    .single()
    logQueryError("DirectorPortalPage applications", appError)

  const listing = app?.listings as unknown as {
    public_slug: string
    units: { unit_number: string; properties: { name: string } }
  } | null

  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"

  // Check payment status
  const { data: payment, error: paymentError } = await service
    .from("application_screening_payments")
    .select("paid_at")
    .eq("application_id", coApp.primary_application_id)
    .eq("subject_type", "co_applicant")
    .eq("subject_id", coApp.id)
    .maybeSingle()
    logQueryError("DirectorPortalPage application_screening_payments", paymentError)

  const data: DirectorPortalData = {
    firstName:      coApp.first_name,
    propertyLabel,
    feeCents:       coApp.individual_fee_cents ?? 25000,
    consentGiven:   !!coApp.stage2_consent_given_at,
    paymentPaid:    !!payment?.paid_at,
    checksComplete: coApp.searchworx_check_status === "complete",
    token,
    slug,
  }

  const allDone = data.consentGiven && data.paymentPaid
  const base = `/apply/${slug}/director-portal/${token}`

  const steps = [
    {
      label: "Give your consent",
      sublabel: "POPIA consent for your personal credit check",
      done: data.consentGiven,
      href: `${base}/consent`,
    },
    {
      label: `Pay your fee — ${formatZAR(data.feeCents)}`,
      sublabel: "Covers credit check, identity and income verification",
      done: data.paymentPaid,
      href: `${base}/payment`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          {data.firstName ? `Hi ${data.firstName} —` : ""} Complete your portion
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{propertyLabel}</p>
      </div>

      {allDone && !data.checksComplete && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <Clock className="size-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Your checks are running</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                This usually takes a few minutes. You will receive your Consumer Report by email when complete.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data.checksComplete && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Your portion is complete</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your Consumer Report has been sent to your email address.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you need to do</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {steps.map((step) => (
            <div key={step.href} className="flex items-center justify-between py-4 gap-4">
              <div className="flex items-start gap-3">
                {step.done
                ? <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
                : <Circle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                }
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.sublabel}</p>
                </div>
              </div>
              {!step.done && (
                <ActionButton asChild tone="secondary" size="sm">
                  <Link href={step.href}>
                    Start →
                  </Link>
                </ActionButton>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* POPIA notice */}
      <p className="text-xs text-muted-foreground text-center">
        Your information is processed under POPIA for tenancy screening purposes only.
        You are a separate data subject — your results will not be shared with other applicants.
      </p>
    </div>
  )
}
