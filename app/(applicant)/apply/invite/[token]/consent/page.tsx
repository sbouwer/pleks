"use client"

/**
 * app/(applicant)/apply/invite/[token]/consent/page.tsx — Stage 2 POPIA credit-check consent
 *
 * Route:  /apply/invite/[token]/consent
 * Auth:   application_tokens.token lookup (validated server-side by API routes)
 * Data:   /api/consent/send-code → /api/consent/verify-code → /api/applications/invite-consent
 * Notes:  ADDENDUM_14F: two-step flow — tick consent, then verify via SMS code.
 *         BUILD_72 P1-R8b-3: the consent text and flow live in components/consent/ScreeningConsentForm.tsx, which a
 *         residential co-applicant's own link renders too — this page adds only the lead's withdraw path.
 *         Decline path keeps the existing anon Supabase write (stage2_status = withdrawn).
 */
import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ScreeningConsentForm } from "@/components/consent/ScreeningConsentForm"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { createClient } from "@/lib/supabase/client"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default function Stage2ConsentPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [confirmDecline, setConfirmDecline] = useState(false)

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

  return (
    <>
      <ScreeningConsentForm
        token={token}
        consentType="standard_bundle"
        recordUrl="/api/applications/invite-consent"
        onRecorded={() => router.push(`/apply/invite/${token}/payment`)}
        onDecline={() => setConfirmDecline(true)}
      />
      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={(o) => { if (!o) setConfirmDecline(false) }}
        title="Withdraw application?"
        description="Are you sure you want to withdraw your application?"
        variant="destructive"
        confirmLabel="Withdraw"
        onConfirm={doDecline}
      />
    </>
  )
}
