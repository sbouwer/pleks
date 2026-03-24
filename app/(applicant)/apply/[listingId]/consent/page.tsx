"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "pleks_application_details"

export default function ConsentPage() {
  const router = useRouter()
  const params = useParams()
  const listingId = params.listingId as string

  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Redirect if no saved details
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      router.replace(`/apply/${listingId}/details`)
    }
  }, [listingId, router])

  async function handleSubmit() {
    if (!agreed) return
    setSubmitting(true)
    setError("")

    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) throw new Error("No application data found")
      const details = JSON.parse(saved)

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
      )

      // Create application record
      const { data: application, error: appError } = await supabase
        .from("applications")
        .insert({
          listing_id: listingId,
          first_name: details.first_name,
          last_name: details.last_name,
          email: details.email,
          phone: details.phone,
          id_type: details.id_type,
          id_number: details.id_number,
          date_of_birth: details.date_of_birth,
          nationality: details.nationality || null,
          permit_type: details.permit_type || null,
          permit_number: details.permit_number || null,
          permit_expiry_date: details.permit_expiry_date || null,
          employment_type: details.employment_type,
          employer_name: details.employer_name || null,
          gross_monthly_income: details.gross_monthly_income
            ? parseInt(details.gross_monthly_income)
            : null,
          stage: "stage_1",
          status: "submitted",
        })
        .select("id")
        .single()

      if (appError) throw appError

      // Create consent log entry
      const { error: consentError } = await supabase
        .from("consent_logs")
        .insert({
          application_id: application.id,
          consent_type: "popia_stage1",
          consented: true,
          ip_address: null, // Could capture via API
          user_agent: navigator.userAgent,
        })

      if (consentError) throw consentError

      // Clear saved form data
      localStorage.removeItem(STORAGE_KEY)

      // Redirect to documents page with application token
      router.push(`/apply/${listingId}/documents?application=${application.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Consent to data processing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Please review and accept before we can proceed with your application.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>POPIA Notice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            In terms of the Protection of Personal Information Act 4 of 2013
            (POPIA), we are required to inform you of how your personal
            information will be processed.
          </p>

          <div className="space-y-2">
            <p className="font-medium text-foreground">What we collect:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Personal details (name, ID, contact information)</li>
              <li>Employment and income information</li>
              <li>Supporting documents you upload</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">How we use it:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>To process and evaluate your rental application</li>
              <li>To verify the information you have provided</li>
              <li>To communicate with you about your application status</li>
              <li>To share with the property manager or landlord for assessment</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-foreground">Data retention:</p>
            <p>
              Your information is retained for the duration of the application
              process. If unsuccessful, data is deleted within 90 days unless
              you consent to remain in our tenant database for future
              opportunities.
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 border border-border">
            <p className="font-medium text-foreground">NOTE:</p>
            <p>
              If you are shortlisted, you will be asked separately to consent
              to a credit check and background screening. This consent covers
              data processing only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Consent checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
        />
        <span className="text-sm">
          I understand how my information will be used and consent to the
          processing of my personal information as described above.
        </span>
      </label>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        disabled={!agreed || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "Submitting..." : "Submit and continue"}
      </Button>
    </div>
  )
}
