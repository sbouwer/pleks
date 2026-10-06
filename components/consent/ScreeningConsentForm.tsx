"use client"

/**
 * components/consent/ScreeningConsentForm.tsx — the applicant stage-2 screening consent: text, tick, SMS verify, record
 *
 * Auth:   the caller's token is validated server-side by /api/consent/send-code and by `recordUrl`
 * Data:   POST /api/consent/send-code → ConsentCodeEntry (/api/consent/verify-code) → POST `recordUrl`
 * Notes:  BUILD_72 P1-R8b-3. ONE component for the counsel-reviewed applicant screening consent, so the lead
 *         (/apply/invite/[token]/consent) and every residential co-applicant / guarantor (their own access_token
 *         link) sign the SAME text — its version is SCREENING_CONSENT_VERSION in lib/screening/screeningConsent.ts.
 *         The text was moved here VERBATIM from the lead page; editing it is a counsel (70H) change and the version
 *         moves with it. The surety-director consent is a different text and does not use this.
 *         No phone on file → consent is recorded without an SMS round, exactly as the lead page always did.
 *         `onDecline` is the lead's withdraw path; a co party has none, so the decline buttons render only with it.
 *         14X P5: `groupClause` renders the group block (the consolidation paragraph and the completion-status sentence)
 *         after the checks and switches the checkbox to the group sentence, and the record call reports it as
 *         `groupClauseShown` — the route re-derives whether the application is a group one before recording it. The
 *         words live in lib/screening/consentWording.ts, never here.
 *         Consent v2 (counsel 2026-10-03): "consent to … performing"; counsel's withdrawal sentence verbatim (point 6);
 *         TPN out (no TPN check runs) and "sequestrations, and blacklisting" struck (point 4: blacklisting is not a
 *         category any provider returns, and whether the products return sequestrations is unverified — nothing parses
 *         them — so the text does not ask consent to either). The
 *         adverse line is a strike only: counsel approved no replacement wording, and v3 names the categories once
 *         Searchworx confirms them.
 */
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { ShieldCheck } from "lucide-react"
import { ConsentCodeEntry } from "@/components/consent/ConsentCodeEntry"
import {
  CONSENT_CHECKBOX_GROUP, CONSENT_CHECKBOX_SINGLE, GROUP_COMPLETION_STATUS_SENTENCE, GROUP_CONSOLIDATION_PARAGRAPH,
} from "@/lib/screening/consentWording"

type Step = "consent" | "verify"

interface SendCodeResponse {
  verificationId: string
  targetMasked: string
  expiresAt: string
  error?: string
}

export interface ScreeningConsentFormProps {
  /** The invite token (lead) or access_token (co party) — sent to send-code and to `recordUrl`. */
  token: string
  /** standard_bundle for the lead's invite token; co_applicant_standard for a party's access_token. */
  consentType: "standard_bundle" | "co_applicant_standard"
  /** The route that records the consent: POST { token, verificationId }. */
  recordUrl: string
  /** Called once the consent is recorded. */
  onRecorded: () => void
  /** The lead's withdraw path. Omitted → no decline buttons. */
  onDecline?: () => void
  /** The application has more than one party (decided server-side by the page): render the group block. */
  groupClause: boolean
}

export function ScreeningConsentForm({ token, consentType, recordUrl, onRecorded, onDecline, groupClause }: Readonly<ScreeningConsentFormProps>) {
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<Step>("consent")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifData, setVerifData] = useState<{ verificationId: string; targetMasked: string; expiresAt: string } | null>(null)

  async function sendCode(): Promise<SendCodeResponse> {
    const res = await fetch("/api/consent/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, consent_type: consentType }),
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

  async function recordConsent(verificationId: string | null) {
    setSubmitting(true)
    setError(null)

    const res = await fetch(recordUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, verificationId, groupClauseShown: groupClause }),
    })

    if (res.ok) {
      onRecorded()
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  if (step === "verify" && verifData) {
    return (
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
          onResend={sendCode}
          label="Credit check consent"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {onDecline && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onDecline}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Decline — withdraw my application
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
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
            By consenting below, you consent to Pleks and its screening partner{" "}
            <strong className="text-foreground">Searchworx</strong> performing
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
              <strong className="text-foreground">Adverse listings</strong>{" "}
              — judgements and defaults
            </li>
          </ul>

          {groupClause && (
            <div className="space-y-2" data-testid="group-clause">
              <p>{GROUP_CONSOLIDATION_PARAGRAPH}</p>
              <p>{GROUP_COMPLETION_STATUS_SENTENCE}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="font-medium text-foreground">Your rights:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You may request a copy of the screening report</li>
              <li>You may dispute any inaccurate information</li>
              <li>
                You may withdraw your consent at any time. If you withdraw consent
                before screening is completed, your application cannot proceed
                through the screening process.
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
        <span className="text-sm">{groupClause ? CONSENT_CHECKBOX_GROUP : CONSENT_CHECKBOX_SINGLE}</span>
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

        {onDecline && (
          <ActionButton
            tone="secondary"
            className="w-full"
            onClick={onDecline}
          >
            Decline — withdraw my application
          </ActionButton>
        )}
      </div>
    </div>
  )
}
