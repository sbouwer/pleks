/**
 * app/(applicant)/apply/invite/[token]/page.tsx — screening-invite landing (shortlisted + fee)
 *
 * Route:  /apply/invite/[token]
 * Auth:   Public — access by application-invite token (application_tokens); no session
 * Data:   application_tokens (+ applications, listings); service client
 * Notes:  Server component. Shows an expiry screen once the token's expires_at passes.
 *
 *         ⚠ THE 30-DAY "REUSE YOUR RECENT REPORT — FREE" CARD WAS REMOVED 2026-08-19, along with
 *         lib/screening/checkRecentReport.ts. It was half-built in two independent ways and both
 *         reached the applicant:
 *
 *         1. It matched on `applicant_email` with NO org filter, so it surfaced an application at
 *            ANOTHER agency — naming that agency's property — and offered to share that report.
 *            Two people behind one address (a couple applying separately, a family address, an
 *            agent who typed their own) meant applicant B was offered applicant A's FitScore and
 *            bureau-derived components. Matching on `id_number_hash` instead would have made it
 *            WORSE, not better: a reliable cross-org identity resolver on the applicant surface is
 *            the shared-tenant-blacklist product CLAUDE.md forbids by name — "a different product,
 *            with a different consent basis and a different regulatory profile, built by accident".
 *
 *         2. Nothing downstream read the `?reuse=` parameter it set. The consent page never
 *            forwarded it and the payment page charged the full fee, described on that same screen
 *            as non-refundable. The applicant was told "Free" and then billed R250/R470.
 *
 *         IF IT IS WANTED, the defensible version is SAME-ORG only: an agency reusing a report it
 *         already paid for, matched on id_number_hash within its own org_id, with the billing path
 *         actually honouring the reuse. That is a product decision with its own consent basis and a
 *         billing change — not a repair of this one.
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { MapPin, Clock, CheckCircle2 } from "lucide-react"
import { fmtDateLongZA } from "@/lib/dates"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createServiceClient()

  // Look up token
  const { data: tokenRecord, error: tokenError } = await supabase
    .from("application_tokens")
    .select("*, applications(*, listings(*))")
    .eq("token", token)
    .single()

  if (tokenError || !tokenRecord) notFound()

  // Check expiry
  const expiresAt = new Date(tokenRecord.expires_at)
  const isExpired = expiresAt < new Date()

  if (isExpired) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="text-center py-8 space-y-3">
            <Clock className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">Invite expired</h1>
            <p className="text-sm text-muted-foreground">
              This screening invite has expired. Please contact the agent for
              assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const application = tokenRecord.applications
  const listing = application?.listings
  // `has_co_applicant`, NOT `is_joint` — there is no is_joint column on applications (verified against the
  // live schema 2026-08-14). The select is `applications(*)`, so it silently came back undefined, isJoint was
  // permanently false, and this page QUOTED R250 to a joint applicant whom /api/billing/screening then
  // charged R470. Same flag the billing route reads, so the quote and the charge cannot diverge.
  const isJoint = application?.has_co_applicant === true
  const fee = isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS

  // Days remaining — computed server-side
  const currentTime = new Date()
  const msRemaining = expiresAt.getTime() - currentTime.getTime()
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))

  return (
    <div className="space-y-6">
      {/* Shortlisted banner */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="flex items-start gap-3">
          <CheckCircle2 className="size-6 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">You&apos;ve been shortlisted!</p>
            <p className="text-sm text-muted-foreground mt-1">
              The property manager has reviewed your application and would like
              to proceed with a background screening.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Property details */}
      {listing && (
        <Card>
          <CardHeader>
            <CardTitle>{listing.property_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {listing.address && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 mt-0.5 shrink-0" />
                <span>{listing.address}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fee and expiry */}
      <Card>
        <CardHeader>
          <CardTitle>Screening fee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              {isJoint ? "Joint application screening" : "Screening fee"}
            </span>
            <span className="text-2xl font-semibold">{formatZAR(fee)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-yellow-500">
            <Clock className="size-4" />
            <span>
              Expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} —{" "}
              {fmtDateLongZA(expiresAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            This fee covers credit checks, ID verification, rental history
            verification, and adverse listing checks.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <ActionButton asChild tone="primary" className="w-full h-12 text-base font-semibold">
        <Link href={`/apply/invite/${token}/consent`}>
          Proceed to consent and payment
        </Link>
      </ActionButton>

      <div className="text-center">
        <button className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
          I no longer wish to proceed
        </button>
      </div>
    </div>
  )
}
