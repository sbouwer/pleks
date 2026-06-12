"use client"

/**
 * app/(applicant)/apply/invite/[token]/consent/page.tsx — Stage 2 POPIA credit-check consent
 *
 * Route:  /apply/invite/[token]/consent
 * Auth:   application_tokens.token lookup (validated server-side by API routes)
 * Data:   /api/consent/send-code → /api/consent/verify-code → /api/applications/invite-consent
 * Notes:  ADDENDUM_14F: two-step flow — tick consent, then verify via SMS code.
 *         ConsentCodeEntry component handles the code entry / resend / expiry UI.
 *         Decline path keeps the existing anon Supabase write (stage2_status = withdrawn).
 */
import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { ShieldCheck } from "lucide-react"
import { ConsentCodeEntry } from "@/components/consent/ConsentCodeEntry"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { createClient } from "@/lib/supabase/client"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Step = "consent" | "verify"

interface SendCodeResponse {
  verificationId: string
  targetMasked: string
  expiresAt: string
  error?: string
}

export default function Stage2ConsentPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<Step>("consent")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifData, setVerifData] = useState<{ verificationId: string; targetMasked: string; expiresAt: string } | null>(null)
  const [confirmDecline, setConfirmDecline] = useState(false)

  async function sendCode(): Promise<SendCodeResponse> {
    const res = await fetch("/api/consent/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, consent_type: "standard_bundle" }),
    })
    return res.json() as Promise<SendCodeResponse>
  }

  async function handleAgree() {
    if (!agreed) return
    setError(null)

    const result = await sendCode()
    if (result.error) {
      // No phone on file — fall through to direct consent
      if (result.error.includes("No phone")) {
        await recordConsent(null)
        return
      }
      setError(result.error)
      return
    }

    setVerifData({ verificationId: result.verificationId, targetMasked: result.targetMasked, expiresAt: result.expiresAt })
    setStep("verify")
  }

  async function handleResend() {
    return sendCode()
  }

  async function recordConsent(verificationId: string | null) {
    setSubmitting(true)
    setError(null)

    const res = await fetch("/api/applications/invite-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, verificationId }),
    })

    if (res.ok) {
      router.push(`/apply/invite/${token}/payment`)
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  async function doDecline() {
    setConfirmDecline(false)
    const supabase = createClient()
    const { data: tokenData, error: tokenDataError } = await supabase
      .from("application_tokens")
      .select("application_id")
      .eq("token", token)
      .single()
    logQueryError("handleDecline application_tokens", tokenDataError)

    if (tokenData) {
      await supabase.from("applications").update({
        stage2_status: "withdrawn",
      }).eq("id", tokenData.application_id)
    }

    router.push(`/apply/invite/${token}`)
  }

  const declineDialog = (
    <ConfirmDialog
      open={confirmDecline}
      onOpenChange={(o) => { if (!o) setConfirmDecline(false) }}
      title="Withdraw application?"
      description="Are you sure you want to withdraw your application?"
      variant="destructive"
      confirmLabel="Withdraw"
      onConfirm={doDecline}
    />
  )

  if (step === "verify" && verifData) {
    return (
      <>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Verify your consent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the code sent to your phone to confirm your consent.
          </p>
        </div>
        <ConsentCodeEntry
          verificationId={verifData.verificationId}
          targetMasked={verifData.targetMasked}
          expiresAt={verifData.expiresAt}
          onVerified={(vid) => void recordConsent(vid)}
          onResend={handleResend}
          label="Credit check consent"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setConfirmDecline(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Decline — withdraw my application
          </button>
        </div>
      </div>
      {declineDialog}
      </>
    )
  }

  return (
    <>
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Credit check consent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          To proceed with screening, we need your consent to perform background
          checks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            POPIA Consent — Background Screening
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            By consenting below, you authorise Pleks and its screening partner{" "}
            <strong className="text-foreground">Searchworx</strong> to perform
            the following checks:
          </p>

          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">TransUnion credit check</strong>{" "}
              — credit score, payment history, and credit accounts
            </li>
            <li>
              <strong className="text-foreground">XDS credit check</strong>{" "}
              — alternative credit bureau for comprehensive coverage
            </li>
            <li>
              <strong className="text-foreground">ID verification</strong>{" "}
              — confirmation of your identity against the Department of Home
              Affairs records
            </li>
            <li>
              <strong className="text-foreground">TPN rental profile</strong>{" "}
              — rental payment history and previous landlord references
            </li>
            <li>
              <strong className="text-foreground">Adverse listings</strong>{" "}
              — judgements, defaults, sequestrations, and blacklisting
            </li>
          </ul>

          <div className="space-y-2">
            <p className="font-medium text-foreground">Your rights:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You may request a copy of the screening report</li>
              <li>You may dispute any inaccurate information</li>
              <li>
                You may withdraw consent at any time, though this will result in
                your application being withdrawn
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
        />
        <span className="text-sm">
          I consent to the credit and background check as described above.
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3">
        <ActionButton
          tone="primary"
          className="w-full h-12 text-base font-semibold"
          disabled={!agreed || submitting}
          onClick={() => void handleAgree()}
        >
          {submitting ? "Processing…" : "Agree and continue →"}
        </ActionButton>

        <ActionButton
          tone="secondary"
          className="w-full"
          onClick={() => setConfirmDecline(true)}
        >
          Decline — withdraw my application
        </ActionButton>
      </div>
    </div>
    {declineDialog}
    </>
  )
}
