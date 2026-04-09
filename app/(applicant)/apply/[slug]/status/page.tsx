"use client"

/**
 * Application status page — token-authenticated.
 * Updates in real-time via Supabase Realtime.
 */

import { useState, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Clock, Circle, Loader2 } from "lucide-react"

interface AppData {
  id: string
  first_name: string
  stage1_status: string
  prescreen_score: number | null
  applicant_email: string
  listings: { public_slug: string | null; asking_rent_cents: number; units: { unit_number: string; properties: { name: string } } } | null
}

const STEPS = [
  { key: "received",  label: "Application received" },
  { key: "review",    label: "Under review (48 hrs)" },
  { key: "shortlist", label: "Shortlist decision" },
  { key: "screening", label: "Screening (if shortlisted)" },
  { key: "decision",  label: "Final decision" },
]

function getPrescreenLabel(score: number): string {
  if (score >= 38) return "Strong"
  if (score >= 30) return "Good"
  if (score >= 22) return "Borderline"
  return "Insufficient"
}

function getPrescreenBarColor(score: number): string {
  if (score >= 38) return "bg-green-500"
  if (score >= 30) return "bg-blue-500"
  if (score >= 22) return "bg-yellow-500"
  return "bg-red-500"
}

function statusToStep(s: string): number {
  switch (s) {
    case "pending_documents":   return 0
    case "documents_submitted": return 1
    case "extracting":          return 1
    case "pre_screen_complete": return 2
    case "shortlisted":         return 3
    case "not_shortlisted":     return 3
    default:                    return 0
  }
}

export default function StatusPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const token = searchParams.get("token")

  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (!token) return
    const supabase = createClient()

    async function load() {
      const { data: tokenRow } = await supabase
        .from("application_tokens")
        .select("application_id")
        .eq("token", token!)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (!tokenRow) { setLoading(false); return }

      const { data } = await supabase
        .from("applications")
        .select("id, first_name, stage1_status, prescreen_score, applicant_email, listings(public_slug, asking_rent_cents, units(unit_number, properties(name)))")
        .eq("id", tokenRow.application_id)
        .single()

      if (data) {
        setApp(data as unknown as AppData)
        setCurrentStep(statusToStep(data.stage1_status))
      }
      setLoading(false)
    }
    void load()

    // Realtime subscription
    const channel = supabase
      .channel(`status-${token}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, (payload) => {
        const updated = payload.new as Record<string, unknown>
        setCurrentStep(statusToStep(updated.stage1_status as string))
        setApp((prev) => prev ? { ...prev, stage1_status: updated.stage1_status as string, prescreen_score: updated.prescreen_score as number | null } : prev)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [token, slug])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>

  if (!app) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Invalid or expired link. Please check your email for your application link.</p>
      </div>
    )
  }

  const isShortlisted = app.stage1_status === "shortlisted"
  const isDeclined = app.stage1_status === "not_shortlisted"
  const prescreenScore = app.prescreen_score
  const prescreenLabel = prescreenScore != null ? getPrescreenLabel(prescreenScore) : null

  const listing = app.listings
  const unit = listing?.units as unknown as { unit_number: string; properties: { name: string } } | null
  const ref = `APP-${app.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="space-y-6">
      {/* Confirmation header */}
      {app.stage1_status === "documents_submitted" && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
          <CheckCircle2 className="size-6 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Application submitted</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Thank you, {app.first_name}. Your application{unit ? ` for ${unit.unit_number} at ${unit.properties.name}` : ""} has been received.
            </p>
          </div>
        </div>
      )}

      {isShortlisted && (
        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <p className="font-semibold text-blue-700">You&apos;ve been shortlisted!</p>
          <p className="text-sm text-muted-foreground mt-1">Check your email for the next steps.</p>
        </div>
      )}

      {isDeclined && (
        <div className="p-4 rounded-xl bg-muted border border-border">
          <p className="font-medium">Application update</p>
          <p className="text-sm text-muted-foreground mt-1">
            Thank you for your application. Unfortunately we are unable to proceed at this time. We wish you well in your search.
          </p>
        </div>
      )}

      {/* Progress */}
      <Card>
        <CardHeader><CardTitle>What happens next</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              let stepIcon: React.ReactNode
              if (i < currentStep) {
                stepIcon = <CheckCircle2 className="size-5 text-green-500 shrink-0" />
              } else if (i === currentStep) {
                stepIcon = <Clock className="size-5 text-yellow-500 animate-pulse shrink-0" />
              } else {
                stepIcon = <Circle className="size-5 text-muted-foreground shrink-0" />
              }
              const stepLabelClass = i <= currentStep ? "text-sm font-medium" : "text-sm text-muted-foreground"
              return (
              <div key={step.key} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                {stepIcon}
                <span className={stepLabelClass}>{step.label}</span>
              </div>
            )})}
          </div>
        </CardContent>
      </Card>

      {/* Pre-screen */}
      {prescreenScore != null && (
        <Card>
          <CardHeader><CardTitle>Your pre-screen indication</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{prescreenScore}/45 — {prescreenLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${getPrescreenBarColor(prescreenScore)}`}
                style={{ width: `${(prescreenScore / 45) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This is based on the information you provided. The final decision is made by the agent.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reference */}
      <Card>
        <CardContent className="pt-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Application reference</span>
            <span className="font-mono font-medium">{ref}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Confirmation sent to</span>
            <span>{app.applicant_email}</span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Bookmark this page to check your status anytime. Updates are sent to {app.applicant_email}.
      </p>
    </div>
  )
}
