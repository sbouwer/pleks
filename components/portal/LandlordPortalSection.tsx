"use client"

import { useState } from "react"
import { Mail, CheckCircle2, Clock, ExternalLink, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full mt-1" disabled>
            Compare plans →
          </Button>
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              disabled={loading || !landlordEmail}
              onClick={sendInvite}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              {loading ? "Sending…" : "Invite to portal"}
            </Button>
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
                disabled={loading}
                onClick={sendInvite}
              >
                {loading ? "Sending…" : "Resend invite"}
              </Button>
            </div>
          </div>
        )}

        {status === "active" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Portal active</span>
            </div>
            <a
              href="/landlord/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Preview landlord view
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-danger w-full"
              disabled={loading}
              onClick={suspendAccess}
            >
              {loading ? "Suspending…" : "Suspend access"}
            </Button>
          </div>
        )}

        {status === "suspended" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Access suspended</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              disabled={loading || !landlordEmail}
              onClick={sendInvite}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              {loading ? "Sending…" : "Re-invite to portal"}
            </Button>
          </div>
        )}
      </div>
    </SidebarSection>
  )
}
