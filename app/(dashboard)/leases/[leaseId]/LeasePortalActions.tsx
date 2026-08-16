"use client"

/**
 * app/(dashboard)/leases/[leaseId]/LeasePortalActions.tsx — Tenant portal send-link / revoke / email actions
 *
 * Route:  /leases/[leaseId] (Contacts tab)
 * Auth:   gateway (dashboard layout)
 * Data:   sendTenantPortalLink, revokeTenantPortalAccess, emailLeaseToTenant server actions
 * Notes:  Multi-tenant mode shows a dropdown to pick which tenant is sent the link.
 *         ⛔ The portal link is NEVER shown to the agent (ADDENDUM_62F §3.1/§16) — the server emails
 *         the tenant and this component only reports success.
 */

import { useState, useRef, useEffect } from "react"
import { ActionButton } from "@/components/ui/actions"
import { toast } from "sonner"
import { Link2, ShieldOff, Loader2, Send, ChevronDown } from "lucide-react"
import { sendTenantPortalLink, revokeTenantPortalAccess } from "@/lib/portal/inviteTenant"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { emailLeaseToTenant } from "./actions"
import type { TenantContactInfo } from "./ContactsTab"
import { fmtDateZA } from "@/lib/dates"

interface Props {
  readonly tenantId: string
  readonly allTenants: TenantContactInfo[]
  readonly leaseId: string
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
}

export function LeasePortalActions({ tenantId, allTenants, leaseId, portalInviteSentAt, hasAuthUser }: Props) {
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const whatsappRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!whatsappOpen) return
    function handleClick(e: MouseEvent) {
      if (whatsappRef.current && !whatsappRef.current.contains(e.target as Node)) setWhatsappOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [whatsappOpen])

  async function handleEmailLease() {
    setEmailing(true)
    const result = await emailLeaseToTenant(leaseId)
    setEmailing(false)
    if (result.error) toast.error(result.error)
    else toast.success("Lease details emailed to tenant")
  }

  // ADDENDUM_62F §3.1/§16: the agent triggers DELIVERY and never receives the link. This used to set
  // a returned URL into state and render it with a copy button — three clicks to an agent-held
  // tenant session, valid 90 days. The server now emails the tenant directly.
  async function handleSendLink(targetTenantId: string) {
    setWhatsappOpen(false)
    setGenerating(true)
    const result = await sendTenantPortalLink(targetTenantId, leaseId)
    setGenerating(false)
    if (result.error) toast.error(result.error)
    else toast.success("Portal link sent to the tenant's email address.")
  }

  async function doRevoke() {
    setRevoking(true)
    const result = await revokeTenantPortalAccess(tenantId)
    setRevoking(false)
    setConfirmRevoke(false)
    if (result.error) toast.error(result.error)
    else toast.success("Portal access revoked")
  }

  const hasMultipleTenants = allTenants.length > 1

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          tone="secondary"
          icon={emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          onClick={handleEmailLease}
          disabled={emailing}
        >
          Email lease
        </ActionButton>

        {/* Send portal link — single tenant: send directly; multiple: pick which */}
        {hasMultipleTenants ? (
          <div ref={whatsappRef} className="relative">
            <ActionButton
              tone="secondary"
              icon={generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              onClick={() => setWhatsappOpen(v => !v)}
              disabled={generating}
            >
              Send portal link
              <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
            </ActionButton>
            {whatsappOpen && (
              <div className="absolute left-0 top-9 z-20 min-w-[180px] rounded-lg border border-border bg-card shadow-md py-1">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Send link to
                </p>
                {allTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSendLink(t.tenantId)}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted transition-colors"
                  >
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">{t.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ActionButton
            tone="secondary"
            icon={generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            onClick={() => handleSendLink(tenantId)}
            disabled={generating}
          >
            Send portal link
          </ActionButton>
        )}

        {(hasAuthUser || portalInviteSentAt) && (
          <ActionButton
            tone="destructive"
            icon={revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
            onClick={() => setConfirmRevoke(true)}
            disabled={revoking}
          >
            Revoke access
          </ActionButton>
        )}
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={(o) => { if (!o) setConfirmRevoke(false) }}
        title="Revoke portal access?"
        description="This will revoke all portal access for this tenant."
        variant="destructive"
        confirmLabel="Revoke access"
        onConfirm={doRevoke}
        loading={revoking}
      />

      {portalInviteSentAt && (
        <p className="text-xs text-muted-foreground">
          Invite sent {fmtDateZA(portalInviteSentAt)}
          {hasAuthUser && " · Tenant has active session"}
        </p>
      )}

      {/*
        The token URL was rendered here with a copy button and a wa.me share link. Both are gone
        (ADDENDUM_62F §3.1/§16): the agent never receives the credential, so there is nothing to
        display. The wa.me link was the same leak by another route — it put the token in the agent's
        own browser and clipboard on the way to WhatsApp.
      */}
    </div>
  )
}
