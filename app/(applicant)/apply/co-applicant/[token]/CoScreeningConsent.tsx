"use client"

/**
 * app/(applicant)/apply/co-applicant/[token]/CoScreeningConsent.tsx — the co party's stage-2 consent step on its own link
 *
 * Auth:   the access_token, validated by /api/consent/send-code and /api/applications/co-applicant/[token]/screening-consent
 * Data:   components/consent/ScreeningConsentForm.tsx (the shared applicant consent — same text and version as the lead)
 * Notes:  BUILD_72 P1-R8. Rendered by the co page once the party has been invited to stage 2 (at shortlist) and has
 *         not yet consented. On success the page re-renders server-side and falls back to the party's normal view.
 *         No withdraw path: a co party has no withdraw action, so the form renders without decline buttons.
 */
import { useRouter } from "next/navigation"
import { ScreeningConsentForm } from "@/components/consent/ScreeningConsentForm"

export function CoScreeningConsent({ token }: Readonly<{ token: string }>) {
  const router = useRouter()
  return (
    <ScreeningConsentForm
      token={token}
      consentType="co_applicant_standard"
      recordUrl={`/api/applications/co-applicant/${encodeURIComponent(token)}/screening-consent`}
      onRecorded={() => router.refresh()}
    />
  )
}
