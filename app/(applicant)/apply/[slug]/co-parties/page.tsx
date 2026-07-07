/**
 * app/(applicant)/apply/[slug]/co-parties/page.tsx — Multi-party portal orchestration view for commercial applications
 *
 * Route:  /apply/[slug]/co-parties?token=[primary_application_token]
 * Auth:   application_tokens lookup (primary contact's token, type = 'shortlist_invite')
 * Data:   v_application_screening_lines, application_co_applicants (status only — no cross-director results)
 * Notes:  Primary contact sees all lines + invitation controls.
 *         Each director's results are NOT shown here — POPIA per-data-subject boundary.
 *         Director lines show status only: Paid/Pending, Consent/Pending, Complete/Running.
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, AlertCircle, Building2, User } from "lucide-react"
import { ResendInviteButton } from "./ResendInviteButton"

interface ScreeningLine {
  application_id: string
  org_id: string
  subject_type: string
  subject_id: string
  subject_name: string
  fee_cents: number | null
  paid_at: string | null
  consented_at: string | null
  expires_at: string | null
  state: string
}

interface CoApplicant {
  id: string
  first_name: string | null
  last_name: string | null
  applicant_email: string
  access_token_expires: string | null
  declined_at: string | null
  is_surety_director: boolean
}

function StateChip({ state }: { state: string }) {
  switch (state) {
    case "complete":
      return <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Complete</Badge>
    case "ready_to_run":
      return <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20">Processing</Badge>
    case "paid_pending_consent":
      return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">Awaiting consent</Badge>
    case "consented_pending_payment":
      return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">Awaiting payment</Badge>
    case "expired_no_consent":
      return <Badge className="bg-red-500/10 text-red-700 border-red-500/20">Expired</Badge>
    default:
      return <Badge variant="secondary">Pending</Badge>
  }
}

export default async function CoPartiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  await params  // slug not needed — applicationId comes from token lookup
  const { token } = await searchParams

  if (!token) notFound()

  const service = await createServiceClient()

  // Validate primary contact token
  const { data: tokenRecord, error: tokenErr } = await service
    .from("application_tokens")
    .select("application_id, expires_at")
    .eq("token", token)
    .single()

  if (tokenErr || !tokenRecord) notFound()
  if (new Date(tokenRecord.expires_at) < new Date()) notFound()

  const applicationId = tokenRecord.application_id

  // Fetch all screening lines for this application
  const { data: lines, error: linesErr } = await service
    .from("v_application_screening_lines")
    .select("application_id, org_id, subject_type, subject_id, subject_name, fee_cents, paid_at, consented_at, expires_at, state")
    .eq("application_id", applicationId)

  if (linesErr) {
    console.error("co-parties: lines query failed:", linesErr.message)
    notFound()
  }

  // Fetch co-applicant rows for director details (status only — no results)
  const { data: coApps, error: coErr } = await service
    .from("application_co_applicants")
    .select("id, first_name, last_name, applicant_email, access_token_expires, declined_at, is_surety_director")
    .eq("primary_application_id", applicationId)
    .eq("is_surety_director", true)

  if (coErr) {
    console.error("co-parties: co-applicants query failed:", coErr.message)
  }

  const allLines = (lines ?? []) as ScreeningLine[]
  const directors = (coApps ?? []) as CoApplicant[]
  const now = new Date()

  const companyLine = allLines.find((l) => l.subject_type === "company")
  const directorLines = allLines.filter((l) => l.subject_type === "co_applicant")

  const totalLines = allLines.length
  const completedLines = allLines.filter((l) => l.state === "complete").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Application progress</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {completedLines} of {totalLines} {totalLines === 1 ? "party" : "parties"} complete
        </p>
      </div>

      {/* Company line */}
      {companyLine && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Company</CardTitle>
              <StateChip state={companyLine.state} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{companyLine.subject_name}</p>
            <div className="flex gap-4 text-muted-foreground">
              <span>Fee: {companyLine.fee_cents ? formatZAR(companyLine.fee_cents) : "—"}</span>
              <span>Payment: {companyLine.paid_at ? "✓ Paid" : "⏰ Pending"}</span>
              <span>Consent: {companyLine.consented_at ? "✓ Given" : "⏰ Pending"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Director lines */}
      {directorLines.map((line) => {
        const coApp = directors.find((d) => d.id === line.subject_id)
        const isDeclined = !!coApp?.declined_at
        const expiresIn = coApp?.access_token_expires
          ? Math.max(0, Math.ceil((new Date(coApp.access_token_expires).getTime() - now.getTime()) / 86_400_000))
          : null

        return (
          <Card key={line.subject_id} className={isDeclined ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <User className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Director — {line.subject_name}</CardTitle>
                {isDeclined
                  ? <Badge variant="destructive">Declined</Badge>
                  : <StateChip state={line.state} />
                }
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {coApp && <p className="text-muted-foreground">{coApp.applicant_email}</p>}

              {!isDeclined && (
                <div className="flex gap-4 text-muted-foreground">
                  <span>Fee: {line.fee_cents ? formatZAR(line.fee_cents) : "—"}</span>
                  <span>Payment: {line.paid_at ? "✓ Paid" : "⏰ Pending"}</span>
                  <span>Consent: {line.consented_at ? "✓ Given" : "⏰ Pending"}</span>
                </div>
              )}

              {!isDeclined && line.state !== "complete" && expiresIn !== null && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                  <Clock className="size-3.5" />
                  <span>Link expires in {expiresIn} day{expiresIn !== 1 ? "s" : ""}</span>
                </div>
              )}

              {!isDeclined && line.state !== "complete" && coApp && (
                <div className="flex gap-2 pt-1">
                  <ResendInviteButton
                    coApplicantId={coApp.id}
                    applicationId={applicationId}
                    orgId={line.org_id}
                    token={token}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Progress note */}
      {completedLines < totalLines && (
        <Card className="border-muted">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              The application will proceed to shortlist review once all parties have completed their portions.
            </p>
          </CardContent>
        </Card>
      )}

      {completedLines === totalLines && totalLines > 0 && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">All parties complete</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                The agent is reviewing the full application. You will be notified of the outcome.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
