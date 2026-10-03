/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/page.tsx — Director portal landing page
 *
 * Route:  /apply/[slug]/director-portal/[token]
 * Auth:   application_co_applicants.access_token lookup — director's private token
 * Data:   application_co_applicants, applications, this party's application_screening_payments line (lib/screening/lineFee.ts)
 * Notes:  Each director accesses only their own row — POPIA per-data-subject isolation.
 *         Director portal flow is Consent → Payment only. Searchworx handles document
 *         collection post-consent; there is no in-portal document upload step.
 *         Token is single-purpose per director; cannot see other directors' data.
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { quoteApplicationFee } from "@/lib/screening/quote"
import { bundleFor, readLine } from "@/lib/screening/lineFee"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import Link from "next/link"
import { CheckCircle2, Clock, Circle } from "lucide-react"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { windowOpen } from "@/lib/screening/window"

async function displayQuote(): Promise<number | null> {
  const q = await quoteApplicationFee(bundleFor("co_applicant"), "director-portal")
  return q.ok ? q.fee_cents : null
}

interface DirectorPortalData {
  firstName: string | null
  propertyLabel: string
  feeCents: number | null
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
    .select("id, org_id, first_name, primary_application_id, stage2_consent_given_at, stage2_invited_at, searchworx_check_status, access_token_expires, declined_at")
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

  // Stage 2 not yet opened for this party (14W §0b): its invite — and its window — start at shortlist. A link held
  // from before then shows nothing to do rather than a consent and payment nobody has asked for yet.
  if (!coApp.stage2_invited_at) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="text-center py-8 space-y-3">
            <Clock className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">Screening has not opened yet</h1>
            <p className="text-sm text-muted-foreground">
              You will receive an email when the application is shortlisted and your part can be completed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Past the party's own window with the line unpaid: the pay step is closed (the payment page redirects here), and the
  // reminders cron declines the line at its next run. Show that rather than a "Start" that loops back (walker F3).
  const windowClosed = !windowOpen(coApp.stage2_invited_at as string)

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

  // This party's own line (14W §0): its paid state and, once the payment page has stamped it, its fee.
  const line = await readLine(service, {
    orgId: coApp.org_id as string, applicationId: coApp.primary_application_id as string,
    subjectType: "co_applicant", subjectId: coApp.id as string,
  })
  const payment = line.ok ? line.row : null

  const data: DirectorPortalData = {
    firstName:      coApp.first_name,
    propertyLabel,
    // The line's stamp once the payment page has written it, else a display-only quote (ADDENDUM_14V) — this page
    // never stamps; the payment page is the first show, after consent.
    feeCents:       payment?.pricing_policy_version ? payment.fee_cents : await displayQuote(),
    consentGiven:   !!coApp.stage2_consent_given_at,
    paymentPaid:    !!payment?.paid_at,
    checksComplete: coApp.searchworx_check_status === "complete",
    token,
    slug,
  }

  const allDone = data.consentGiven && data.paymentPaid
  const base = `/apply/${slug}/director-portal/${token}`

  if (windowClosed && !data.paymentPaid) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="text-center py-8 space-y-3">
            <Clock className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">Your screening window has closed</h1>
            <p className="text-sm text-muted-foreground">
              Your portion was not completed in time. Please ask the primary applicant if you still want to take part.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const steps = [
    {
      label: "Give your consent",
      sublabel: "POPIA consent for your personal credit check",
      done: data.consentGiven,
      href: `${base}/consent`,
    },
    {
      label: data.feeCents === null ? "Pay your fee" : `Pay your fee — ${formatZAR(data.feeCents)}`,
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
