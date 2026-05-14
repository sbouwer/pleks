/**
 * app/(applicant)/apply/[slug]/co-parties/ResendInviteButton.tsx — Client button for resending director invite
 *
 * Auth:   No auth gate — called from the primary contact's co-parties view (token-gated parent page)
 * Data:   resendDirectorInvite server action
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { resendDirectorInvite } from "@/lib/applications/commercial"
import { RefreshCw } from "lucide-react"

interface Props {
  coApplicantId: string
  applicationId: string
  orgId: string
}

type ButtonState = "idle" | "sending" | "sent" | "error"

function buttonLabel(s: ButtonState): string {
  if (s === "sending") return "Sending…"
  if (s === "sent") return "Invite sent"
  if (s === "error") return "Failed — try again"
  return "Resend invitation"
}

export function ResendInviteButton({ coApplicantId, applicationId, orgId }: Props) {
  const [state, setState] = useState<ButtonState>("idle")

  async function handleResend() {
    setState("sending")
    const result = await resendDirectorInvite(coApplicantId, applicationId, orgId)
    setState(result.ok ? "sent" : "error")
    if (result.ok) {
      setTimeout(() => setState("idle"), 4000)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={state === "sending" || state === "sent"}
      onClick={handleResend}
    >
      <RefreshCw className="size-3.5 mr-1.5" />
      {buttonLabel(state)}
    </Button>
  )
}
