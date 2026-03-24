import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Clock, CheckCircle2 } from "lucide-react"

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
  const isJoint = application?.is_joint === true
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
              {expiresAt.toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            This fee covers credit checks, ID verification, rental history
            verification, and adverse listing checks.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        render={<Link href={`/apply/invite/${token}/consent`} />}
      >
        Proceed to consent and payment
      </Button>

      <div className="text-center">
        <button className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
          I no longer wish to proceed
        </button>
      </div>
    </div>
  )
}
