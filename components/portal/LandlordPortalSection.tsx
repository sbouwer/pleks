"use client"

/**
 * components/portal/LandlordPortalSection.tsx — Landlord portal invite/status sidebar section shown on landlord contact page
 *
 * Auth:   gateway (dashboard layout); tier-gated (Portfolio/Firm only)
 * Data:   /api/landlords/[id]/portal-invite for invite dispatch and suspension
 */
import { useState } from "react"
import { Mail, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { SidebarSection } from "@/components/contacts/SidebarSection"
import { toast } from "sonner"

type PortalStatus = "none" | "invited" | "active" | "suspended"

interface Props {
  landlordId: string
  tier: string
  portalStatus: PortalStatus
  portalInvitedAt: string | null
  landlordEmail: string | null
}

const PORTAL_TIERS = new Set(["portfolio", "firm"])

export function LandlordPortalSection({
  landlordId,
  tier,
  portalStatus: initialStatus,
  portalInvitedAt,
  landlordEmail,
}: Readonly<Props>) {
  const [status, setStatus] = useState<PortalStatus>(initialStatus)
  const [loading, setLoading] = useState(false)

  const hasPortalAccess = PORTAL_TIERS.has(tier)

  async function sendInvite() {
    if (!landlordEmail) { toast.error("No email address on file"); return }
    setLoading(true)
    const res = await fetch(`/api/landlords/${landlordId}/portal-invite`, { method: "POST" })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      toast.error(d.error ?? "Could not send invite")
      return
    }
    setStatus("invited")
    toast.success("Invite sent to " + landlordEmail)
  }

  async function suspendAccess() {
    setLoading(true)
    const res = await fetch(`/api/landlords/${landlordId}/portal-invite`, { method: "DELETE" })
    setLoading(false)
    if (!res.ok) { toast.error("Could not suspend access"); return }
    setStatus("suspended")
    toast.success("Portal access suspended")
  }

  // Upsell for non-portal tiers
  if (!hasPortalAccess) {
    return (
      <SidebarSection title="Landlord portal">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Give your landlords a login to view their properties, track maintenance, approve jobs, and download statements.
          </p>
          <p className="text-xs text-muted-foreground">Available on Portfolio and Firm plans.</p>
          <InlineLink href="/settings/subscription" withArrow>Compare plans</InlineLink>
        </div>
      </SidebarSection>
    )
  }

  return (
    <SidebarSection title="Landlord portal">
      <div className="space-y-3">
        {status === "none" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Invite this landlord to view their properties, maintenance, and statements online.
            </p>
            {!landlordEmail && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Add an email address first
              </p>
            )}
            <ActionButton
              tone="secondary"
              icon={<Mail className="h-3.5 w-3.5" />}
              disabled={loading || !landlordEmail}
              onClick={sendInvite}
            >
              {loading ? "Sending…" : "Invite to portal"}
            </ActionButton>
          </div>
        )}

        {status === "invited" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Invite sent
                {portalInvitedAt ? ` on ${new Date(portalInvitedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                {" "}— awaiting landlord setup
              </span>
            </div>
            <div className="flex gap-2">
              <ActionButton
                tone="secondary"
                disabled={loading}
                onClick={sendInvite}
              >
                {loading ? "Sending…" : "Resend invite"}
              </ActionButton>
            </div>
          </div>
        )}

        {status === "active" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Portal active</span>
            </div>
            <InlineLink href="/landlord/dashboard" external>
              Preview landlord view
            </InlineLink>
            <ActionButton
              tone="destructive"
              disabled={loading}
              onClick={suspendAccess}
            >
              {loading ? "Suspending…" : "Suspend access"}
            </ActionButton>
          </div>
        )}

        {status === "suspended" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Access suspended</span>
            </div>
            <ActionButton
              tone="secondary"
              icon={<Mail className="h-3.5 w-3.5" />}
              disabled={loading || !landlordEmail}
              onClick={sendInvite}
            >
              {loading ? "Sending…" : "Re-invite to portal"}
            </ActionButton>
          </div>
        )}
      </div>
    </SidebarSection>
  )
}
