/**
 * app/(applicant)/apply/[slug]/director-portal/[token]/consent/DirectorConsentForm.tsx
 *
 * Auth:   Public — token-validated by parent server page
 * Data:   /api/consent/send-code → /api/consent/verify-code → /api/applications/director-consent
 * Notes:  ADDENDUM_14F. Two-step flow: (1) tick consent, (2) SMS code verification.
 *         Consent is only recorded server-side after SMS verification succeeds.
 *         hasPhone=false shows a warning but still allows consent (agents may add phone later).
 */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConsentCodeEntry } from "@/components/consent/ConsentCodeEntry"

interface Props {
  coApplicantId: string
  token: string
  slug: string
  firstName: string | null
  hasPhone: boolean
}

function getButtonLabel(step: Step, hasPhone: boolean): string {
  if (step === "submitting") return "Saving…"
  if (hasPhone) return "Verify and consent →"
  return "I consent — continue"
}

type Step = "consent" | "verify" | "submitting"

interface SendCodeResponse {
  verificationId: string
  targetMasked: string
  expiresAt: string
  error?: string
}

export function DirectorConsentForm({ coApplicantId, token, slug, firstName, hasPhone }: Readonly<Props>) {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<Step>("consent")
  const [error, setError] = useState<string | null>(null)
  const [verifData, setVerifData] = useState<{ verificationId: string; targetMasked: string; expiresAt: string } | null>(null)

  async function sendCode(): Promise<SendCodeResponse> {
    const res = await fetch("/api/consent/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, consent_type: "director_standard" }),
    })
    return res.json() as Promise<SendCodeResponse>
  }

  async function handleContinue() {
    if (!agreed) return
    setError(null)

    if (!hasPhone) {
      // No phone — skip SMS verification, record consent directly
      await recordConsent(null)
      return
    }

    const result = await sendCode()
    if (result.error) {
      setError(result.error)
      return
    }
    setVerifData({ verificationId: result.verificationId, targetMasked: result.targetMasked, expiresAt: result.expiresAt })
    setStep("verify")
  }

  async function handleVerified(verificationId: string) {
    await recordConsent(verificationId)
  }

  async function handleResend() {
    return sendCode()
  }

  async function recordConsent(verificationId: string | null) {
    setStep("submitting")
    setError(null)

    const res = await fetch("/api/applications/director-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coApplicantId, token, verificationId }),
    })

    if (res.ok) {
      router.push(`/apply/${slug}/director-portal/${token}`)
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Something went wrong. Please try again.")
      setStep(verifData ? "verify" : "consent")
    }
  }

  if (step === "verify" && verifData) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          To confirm your consent, enter the verification code sent to your phone.
        </p>
        <ConsentCodeEntry
          verificationId={verifData.verificationId}
          targetMasked={verifData.targetMasked}
          expiresAt={verifData.expiresAt}
          onVerified={(vid) => void handleVerified(vid)}
          onResend={handleResend}
          label="Consent"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
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

        {!hasPhone && (
          <p className="text-xs text-muted-foreground bg-muted rounded p-2">
            No phone number on file — your consent will be recorded without SMS verification.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          disabled={!agreed || step === "submitting"}
          onClick={() => void handleContinue()}
        >
          {getButtonLabel(step, hasPhone)}
        </Button>
      </CardContent>
    </Card>
  )
}
