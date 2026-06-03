"use client"

/**
 * components/contractors/ContractorPortalSection.tsx — Contractor portal invite/status section shown on contractor detail cards
 *
 * Auth:   gateway (dashboard layout); tier-gated (Portfolio/Firm only)
 * Data:   /api/suppliers/[id]/portal-invite for invite dispatch
 */

import { useState } from "react"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { toast } from "sonner"
import { Mail, CheckCircle2, Clock } from "lucide-react"

type PortalStatus = "none" | "invited" | "active" | "suspended"

interface ContractorPortalSectionProps {
  contractorId: string
  tier: string
  portalStatus: PortalStatus
  portalInviteSentAt: string | null
  contractorEmail: string | null
}

export function ContractorPortalSection({
  contractorId,
  tier,
  portalStatus: initialStatus,
  portalInviteSentAt,
  contractorEmail,
}: Readonly<ContractorPortalSectionProps>) {
  const [status, setStatus] = useState<PortalStatus>(initialStatus)
  const [sending, setSending] = useState(false)
  const isPortalTier = tier === "portfolio" || tier === "firm"

  async function sendInvite() {
    setSending(true)
    const res = await fetch(`/api/suppliers/${contractorId}/portal-invite`, { method: "POST" })
    setSending(false)

    if (!res.ok) {
      const data = await res.json() as { error?: string }
      toast.error(data.error ?? "Could not send invite")
      return
    }
    setStatus("invited")
    toast.success(`Portal invite sent to ${contractorEmail ?? "contractor"}`)
  }

  // ── Upsell card for Owner / Steward ─────────────────────────
  if (!isPortalTier) {
    return (
      <div className="border-t pt-3 mt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contractor portal</span>
        <div className="mt-2 rounded-lg border border-border/50 bg-surface-elevated/60 px-3 py-3 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Give your contractors a login to manage jobs, submit quotes, upload compliance
            documents, and track payments.
          </p>
          <p className="text-xs text-muted-foreground">
            Available on{" "}
            <span className="font-medium text-foreground">Portfolio</span> and{" "}
            <span className="font-medium text-foreground">Firm</span> plans.
          </p>
          <InlineLink href="/settings/subscription" className="mt-1">
            Compare plans
          </InlineLink>
        </div>
      </div>
    )
  }

  // ── Portal management for Portfolio / Firm ──────────────────
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contractor portal</span>
      <div className="mt-2 space-y-2">
        {status === "none" && (
          <>
            <p className="text-xs text-muted-foreground">
              {contractorEmail
                ? `Invite ${contractorEmail} to the contractor portal.`
                : "Add an email address to this contractor before sending a portal invite."}
            </p>
            <ActionButton
              tone="secondary"
              icon={<Mail className="h-3 w-3" />}
              onClick={sendInvite}
              disabled={sending || !contractorEmail}
            >
              {sending ? "Sending..." : "Invite to portal"}
            </ActionButton>
          </>
        )}

        {status === "invited" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Invite sent
                {portalInviteSentAt
                  ? ` on ${new Date(portalInviteSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
                  : ""}
                {" — "}awaiting acceptance
              </span>
            </div>
            <ActionButton
              tone="secondary"
              onClick={sendInvite}
              disabled={sending}
            >
              {sending ? "Sending..." : "Resend invite"}
            </ActionButton>
          </div>
        )}

        {status === "active" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span>Portal active — contractor can log in</span>
          </div>
        )}

        {status === "suspended" && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600/80">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span>Portal access suspended</span>
          </div>
        )}
      </div>
    </div>
  )
}
