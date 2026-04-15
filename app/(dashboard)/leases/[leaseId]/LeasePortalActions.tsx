"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Mail, Link2, ShieldOff, Copy, Check, Loader2, MessageCircle, Send } from "lucide-react"
import { inviteTenantPortal, generateTenantPortalLink, revokeTenantPortalAccess } from "@/lib/portal/inviteTenant"
import { emailLeaseToTenant } from "./actions"

interface Props {
  readonly tenantId: string
  readonly leaseId: string
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
}

export function LeasePortalActions({ tenantId, leaseId, portalInviteSentAt, hasAuthUser }: Props) {
  const [inviting, setInviting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailing, startEmail] = useTransition()

  function handleEmailLease() {
    startEmail(async () => {
      const result = await emailLeaseToTenant(leaseId)
      if (result.error) toast.error(result.error)
      else toast.success("Lease details emailed to tenant")
    })
  }

  async function handleInvite() {
    setInviting(true)
    const result = await inviteTenantPortal(tenantId, leaseId)
    setInviting(false)
    if (result.error) toast.error(result.error)
    else toast.success("Portal invite sent")
  }

  async function handleGenerateLink() {
    setGenerating(true)
    const result = await generateTenantPortalLink(tenantId, leaseId)
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleInvite}
          disabled={inviting}
        >
          {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
          {portalInviteSentAt ? "Re-send invite" : "Invite via email"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleEmailLease}
          disabled={emailing}
        >
          {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Email lease
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerateLink}
          disabled={generating}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
          Generate WhatsApp link
        </Button>

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
