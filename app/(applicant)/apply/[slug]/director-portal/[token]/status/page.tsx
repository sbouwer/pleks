/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/status/page.tsx — Director screening status page
 *
 * Route:  /apply/[slug]/director-portal/[token]/status
 * Auth:   access_token validated server-side by /api/applications/director-status/[token]
 * Data:   /api/applications/director-status/[token] — polled every 10s
 * Notes:  Polling replaces a Supabase realtime subscription. application_co_applicants has no
 *         anon SELECT policy (agents only), so direct client queries return nothing. The API
 *         route validates the token server-side via the service client.
 *         Polling stops automatically once checksComplete is true.
 */
"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, Circle } from "lucide-react"

interface StatusData {
  firstName: string | null
  consentGiven: boolean
  paymentPaid: boolean
  checksComplete: boolean
  checkStatus: string
}

const STEPS = [
  { key: "docs",    label: "Documents received" },
  { key: "consent", label: "Consent recorded" },
  { key: "payment", label: "Payment confirmed" },
  { key: "checks",  label: "Screening checks running" },
  { key: "done",    label: "Consumer Report delivered" },
]

const POLL_INTERVAL_MS = 10_000

export default function DirectorStatusPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      const res = await fetch(`/api/applications/director-status/${token}`)
      if (!res.ok) { setLoading(false); return }
      const json = await res.json() as StatusData
      setData(json)
      setLoading(false)
      if (json.checksComplete && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    void fetchStatus()
    intervalRef.current = setInterval(() => { void fetchStatus() }, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [token])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Clock className="size-6 animate-pulse text-muted-foreground" />
    </div>
  )

  if (!data) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground text-sm">Invalid or expired director link.</p>
    </div>
  )

  const stepsDone = [
    true,                  // docs — assumed from this page being reachable post-flow
    data.consentGiven,
    data.paymentPaid,
    data.checkStatus === "running" || data.checksComplete,
    data.checksComplete,
  ]

  const currentStep = stepsDone.lastIndexOf(true)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {data.firstName ? `${data.firstName} — ` : ""}Screening status
        </h1>
      </div>

      {data.checksComplete && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Screening complete</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your Consumer Report has been sent to your email. Thank you for completing your portion.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i <= currentStep
              const active = i === currentStep + 1 && !data.checksComplete
              let stepIcon: React.ReactNode
              if (done) {
                stepIcon = <CheckCircle2 className="size-5 text-green-500 shrink-0" />
              } else if (active) {
                stepIcon = <Clock className="size-5 text-yellow-500 animate-pulse shrink-0" />
              } else {
                stepIcon = <Circle className="size-5 text-muted-foreground shrink-0" />
              }
              return (
                <div key={step.key} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  {stepIcon}
                  <span className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Your results are shared only with the leasing agent — not with other applicants or directors.
      </p>
    </div>
  )
}
