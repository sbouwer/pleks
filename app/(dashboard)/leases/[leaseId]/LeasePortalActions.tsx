"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Link2, ShieldOff, Copy, Check, Loader2, MessageCircle, Send, ChevronDown } from "lucide-react"
import { generateTenantPortalLink, revokeTenantPortalAccess } from "@/lib/portal/inviteTenant"
import { emailLeaseToTenant } from "./actions"
import { canUseLeaseFeature } from "@/lib/billing/leaseFeatures"
import { PremiumFeatureGate } from "@/components/billing/PremiumFeatureGate"
import type { TenantContactInfo } from "./ContactsTab"

interface Props {
  readonly tenantId: string
  readonly allTenants: TenantContactInfo[]
  readonly leaseId: string
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
  readonly premiumEnabled: boolean
  readonly orgTier: string | null
  readonly subscriptionStatus: string | null
  readonly premiumSlotsUsed: number
  readonly leaseLabel: string | null
}

export function LeasePortalActions({ tenantId, allTenants, leaseId, portalInviteSentAt, hasAuthUser, premiumEnabled, orgTier, subscriptionStatus, premiumSlotsUsed, leaseLabel }: Props) {
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  // Optimistically track premium state after gate enables it
  const [localPremiumEnabled, setLocalPremiumEnabled] = useState(premiumEnabled)
  const whatsappRef = useRef<HTMLDivElement>(null)

  const canWhatsApp = canUseLeaseFeature(
    { premium_enabled: localPremiumEnabled, org_tier: orgTier },
    "whatsapp",
    subscriptionStatus,
  )

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

  async function handleGenerateLink(targetTenantId: string) {
    setWhatsappOpen(false)
    setGenerating(true)
    const result = await generateTenantPortalLink(targetTenantId, leaseId)
    setGenerating(false)
    if (result.error) {
      toast.error(result.error)
    } else if (result.url) {
      setGeneratedUrl(result.url)
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRevoke() {
    if (!confirm("This will revoke all portal access for this tenant. Continue?")) return
    setRevoking(true)
    const result = await revokeTenantPortalAccess(tenantId)
    setRevoking(false)
    if (result.error) toast.error(result.error)
    else toast.success("Portal access revoked")
  }

  const hasMultipleTenants = allTenants.length > 1

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleEmailLease}
          disabled={emailing}
        >
          {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Email lease
        </Button>

        {/* WhatsApp link — gated by premium; single tenant: generate directly; multiple: pick first */}
        {hasMultipleTenants ? (
          <div ref={whatsappRef} className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (canWhatsApp) { setWhatsappOpen(v => !v) } else { setGateOpen(true) } }}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
              WhatsApp link
              <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
            </Button>
            {whatsappOpen && (
              <div className="absolute left-0 top-9 z-20 min-w-[180px] rounded-lg border border-border bg-card shadow-md py-1">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Generate link for
                </p>
                {allTenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleGenerateLink(t.tenantId)}
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => { if (canWhatsApp) { handleGenerateLink(tenantId) } else { setGateOpen(true) } }}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
            WhatsApp link
          </Button>
        )}

        <PremiumFeatureGate
          open={gateOpen}
          onClose={() => setGateOpen(false)}
          feature="whatsapp"
          leaseId={leaseId}
          leaseLabel={leaseLabel}
          usedSlots={premiumSlotsUsed}
          onEnabled={() => setLocalPremiumEnabled(true)}
        />

        {(hasAuthUser || portalInviteSentAt) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevoke}
            disabled={revoking}
            className="text-danger hover:text-danger hover:bg-danger/10"
          >
            {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldOff className="h-3.5 w-3.5 mr-1.5" />}
            Revoke access
          </Button>
        )}
      </div>

      {portalInviteSentAt && (
        <p className="text-xs text-muted-foreground">
          Invite sent {new Date(portalInviteSentAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
          {hasAuthUser && " · Tenant has active session"}
        </p>
      )}

      {generatedUrl && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 flex items-center gap-2">
          <code className="flex-1 text-xs truncate">{generatedUrl}</code>
          <button onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy link">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
          <a
            href={"https://wa.me/?text=" + encodeURIComponent("Hi, here is your Pleks tenant portal link: " + generatedUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-[#25D366] transition-colors"
            title="Share via WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  )
}
