"use client"

/**
 * app/(applicant)/apply/invite/[token]/status/page.tsx — live application/screening status tracker
 *
 * Route:  /apply/invite/[token]/status
 * Auth:   Public — invite token; the server validates it inside /api/applications/invite-status/[token]
 * Data:   GET /api/applications/invite-status/[token], polled every 10s until a decision
 * Notes:  Client page, and PayFast's return_url for the lead's screening fee (lib/payfast/forms.ts).
 *         A12: this page read application_tokens and applications through the browser client and subscribed to
 *         realtime on applications. Both tables are org-member-only under RLS, so an applicant with no session got
 *         no rows and the page fell back to its defaults — "Screening fee paid" — for any token, valid or not. It
 *         now polls a service-client route, the director tracker's pattern, and shows "not found" when the token
 *         does not resolve. "Paid" is shown only once the ITN has stamped the line; PayFast can return the payer
 *         before the ITN lands, so until then the page says the payment is being confirmed.
 */
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Clock, Circle, Loader2 } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STEPS = [
  { key: "submitted", label: "Application submitted" },
  { key: "documents", label: "Documents uploaded" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "payment", label: "Payment received" },
  { key: "screening", label: "Background screening" },
  { key: "decision", label: "Decision" },
]

const POLL_INTERVAL_MS = 10_000

interface InviteStatus {
  reference: string
  stage2Status: string | null
  feePaid: boolean
  // The fee ACTUALLY charged, read from the application row — not the single-applicant constant, which
  // quoted R250 to a joint applicant who paid R470.
  feeCents: number | null
}

function statusToStep(stage2Status: string | null, feePaid: boolean): number {
  if (stage2Status === "approved" || stage2Status === "declined") return 5
  if (stage2Status === "screening_complete") return 5
  if (stage2Status === "screening_in_progress") return 4
  if (feePaid) return 3
  return 2
}

const isFinal = (s: string | null) => s === "approved" || s === "declined"

function feeLine(status: InviteStatus): string {
  if (!status.feePaid) return "We're confirming your payment — this page updates on its own."
  return status.feeCents == null ? "Screening fee paid" : `Screening fee: ${formatZAR(status.feeCents)} paid`
}

export default function Stage2StatusPage() {
  const params = useParams()
  const token = params.token as string

  const [status, setStatus] = useState<InviteStatus | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }

    async function load() {
      try {
        const res = await fetch(`/api/applications/invite-status/${encodeURIComponent(token)}`)
        if (cancelled) return
        if (res.status === 404 || res.status === 410 || res.status === 400) {
          setMissing(true)
          stop()
        } else if (res.ok) {
          const next = await res.json() as InviteStatus
          if (cancelled) return
          setStatus(next)
          if (isFinal(next.stage2Status)) stop()
        }
        // Any other failure keeps the last good state and tries again on the next tick.
      } catch {
        // Network blip — the next tick retries.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    timer = setInterval(() => { void load() }, POLL_INTERVAL_MS)
    return () => { cancelled = true; stop() }
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (missing || !status) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Application not found</h1>
        <p className="text-sm text-muted-foreground">
          This link is invalid or has expired. Contact the agent managing this listing for help.
        </p>
      </div>
    )
  }

  const { stage2Status, reference } = status
  const currentStep = statusToStep(stage2Status, status.feePaid)

  function stepIcon(index: number) {
    if (index < currentStep) return <CheckCircle2 className="size-5 text-green-500" />
    if (index === currentStep) return <Clock className="size-5 text-yellow-500 animate-pulse" />
    return <Circle className="size-5 text-muted-foreground" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Application status</h1>
        <p className="text-sm text-muted-foreground mt-1">{feeLine(status)}</p>
      </div>

      {stage2Status === "approved" && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Congratulations! Your application has been approved. Check your email
              for lease details.
            </p>
          </CardContent>
        </Card>
      )}

      {stage2Status === "declined" && (
        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Thank you for your application. After careful consideration, we are
              unable to proceed at this time. We wish you well in finding a suitable home.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-2">
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center gap-3 py-3">
                {stepIcon(i)}
                <span className={i <= currentStep ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {stage2Status === "screening_in_progress" && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Your background checks are being processed. This typically completes
              within a few hours. We&apos;ll email you when a decision has been made.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Have questions? Contact the agent managing this listing.
          </p>
          <p className="text-sm mt-2 text-muted-foreground">
            Reference: <span className="font-mono text-foreground">{reference}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
