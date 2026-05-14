/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/consent/DirectorConsentForm.tsx — Client consent form
 *
 * Auth:   Public — token-validated by parent server page
 * Data:   Submits to /api/applications/director-consent route (marks stage2_consent_given_at)
 */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface Props {
  coApplicantId: string
  token: string
  slug: string
  firstName: string | null
}

export function DirectorConsentForm({ coApplicantId, token, slug, firstName }: Props) {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!agreed) return
    setLoading(true)
    setError(null)

    const res = await fetch("/api/applications/director-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coApplicantId, token }),
    })

    if (res.ok) {
      router.push(`/apply/${slug}/director-portal/${token}`)
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="flex items-start gap-3">
          <input
            id="consent"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 size-4 rounded border-border accent-foreground cursor-pointer"
          />
          <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
            I, {firstName ?? "the director"}, explicitly consent to the processing of my personal
            information for tenancy screening purposes as described above.
            I understand my rights under POPIA and that I may withdraw consent at any time,
            subject to any legally required retention periods.
          </label>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          className="w-full"
          disabled={!agreed || loading}
          onClick={handleSubmit}
        >
          {loading ? "Saving…" : "I consent — continue"}
        </Button>
      </CardContent>
    </Card>
  )
}
