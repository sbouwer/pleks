"use client"

/**
 * Step 3: Review + POPIA consent + submit.
 * Calculates pre-screen score, shows summary, gets consent, submits.
 * On submit: updates status → documents_submitted, sends Email 1 + 2.
 */

import { useState, useEffect } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatZAR } from "@/lib/constants"
import { Loader2, CheckCircle2 } from "lucide-react"

interface AppData {
  id: string
  first_name: string
  last_name: string
  applicant_email: string
  employment_type: string | null
  employer_name: string | null
  gross_monthly_income_cents: number | null
  prescreen_score: number | null
  bank_statement_extracted: Record<string, unknown> | null
  stage1_status: string
  listings: {
    id: string
    public_slug: string | null
    asking_rent_cents: number
    units: { unit_number: string; properties: { name: string; city: string | null } }
  } | null
}

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

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const token = searchParams.get("token")

  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [consented, setConsented] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { router.replace(`/apply/${slug}/details`); return }

    const supabase = createClient()
    supabase
      .from("application_tokens")
      .select("application_id")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()
      .then(async ({ data: tokenRow }) => {
        if (!tokenRow) { router.replace(`/apply/${slug}/details`); return }

        const { data } = await supabase
          .from("applications")
          .select("id, first_name, last_name, applicant_email, employment_type, employer_name, gross_monthly_income_cents, prescreen_score, bank_statement_extracted, stage1_status, listings(id, public_slug, asking_rent_cents, units(unit_number, properties(name, city)))")
          .eq("id", tokenRow.application_id)
          .single()

        setApp(data as unknown as AppData)
        setLoading(false)
      })
  }, [token, slug, router])

  async function handleSubmit() {
    if (!app || !consented) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/applications/${app.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consentIp: null }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to submit")

      router.push(`/apply/${slug}/status?token=${token}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }
  if (!app) return null

  const listing = app.listings
  const unit = listing?.units as unknown as { unit_number: string; properties: { name: string; city: string | null } } | null
  const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "—"
  const prescreenScore = app.prescreen_score
  const prescreenLabel = prescreenScore != null ? getPrescreenLabel(prescreenScore) : null
  const prescreenBarColor = prescreenScore != null ? getPrescreenBarColor(prescreenScore) : "bg-red-500"
  const rentToIncome = app.gross_monthly_income_cents && listing?.asking_rent_cents
    ? ((listing.asking_rent_cents / app.gross_monthly_income_cents) * 100).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Step 3 of 3</p>
        <h1 className="text-xl font-semibold">Review your application</h1>
      </div>

      {/* Applying for */}
      <Card>
        <CardHeader><CardTitle>Applying for</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{propertyLabel}</p>
          {listing && <p className="text-muted-foreground">{formatZAR(listing.asking_rent_cents)}/month</p>}
        </CardContent>
      </Card>

      {/* Your details */}
      <Card>
        <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name" value={`${app.first_name} ${app.last_name}`} />
          <Row label="Email" value={app.applicant_email} />
          {app.employment_type && (
            <Row label="Employment" value={`${formatEmployment(app.employment_type)}${app.employer_name ? ` — ${app.employer_name}` : ""}`} />
          )}
          {app.gross_monthly_income_cents && (
            <Row label="Stated income" value={`${formatZAR(app.gross_monthly_income_cents)}/month`} />
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm">
            {["SA ID", "3 Payslips", "Bank statement", "Employment letter"].map((doc) => (
              <div key={doc} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-green-500" />
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Income check */}
      {rentToIncome && (
        <Card>
          <CardHeader><CardTitle>Income check</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Stated income" value={`${formatZAR(app.gross_monthly_income_cents!)}/month`} />
            <Row label="Rent-to-income" value={`${rentToIncome}%${parseFloat(rentToIncome) < 30 ? " ✓ Below 30% threshold" : " ⚠ Above 30% threshold"}`} />
          </CardContent>
        </Card>
      )}

      {/* Pre-screen */}
      {prescreenScore != null && (
        <Card>
          <CardHeader><CardTitle>Pre-screen indication</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>{prescreenScore}/45 — {prescreenLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${prescreenBarColor}`}
                style={{ width: `${(prescreenScore / 45) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Based on the information you provided. The final decision is made by the agent.
            </p>
          </CardContent>
        </Card>
      )}

      {/* POPIA Consent */}
      <Card className="border-border">
        <CardHeader><CardTitle>Data processing consent</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            In terms of the Protection of Personal Information Act (POPIA), we need your consent to process your application.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-border accent-primary shrink-0"
            />
            <span className="text-sm">
              I consent to the processing of my personal information for the purpose of evaluating this rental application,
              in accordance with POPIA. I understand my data will be stored securely and retained for no longer than 12 months.
            </span>
          </label>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            This does NOT authorise a credit check. If shortlisted, you will be asked separately to consent and pay
            a screening fee before any credit checks are performed.
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full h-12 text-base font-semibold"
        disabled={!consented || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" />Submitting…</> : "Submit application →"}
      </Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function formatEmployment(type: string): string {
  const map: Record<string, string> = {
    permanent: "Permanent", contract: "Contract", self_employed: "Self-employed",
    retired: "Retired", student: "Student", unemployed: "Unemployed",
  }
  return map[type] ?? type
}
