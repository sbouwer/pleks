"use client"

/**
 * app/(dashboard)/settings/team/TransferOwnershipTab.tsx — owner-only ownership transfer
 *
 * Route:  /settings/team?tab=transfer (owner-only; page hides the tab otherwise)
 * Data:   user_orgs (member picker); POST /api/team/transfer-ownership (atomic RPC, step-up gated)
 * Notes:  The route fails closed without a verified step-up token. Flow: POST → 401 {challengeToken} →
 *         StepUpModal (TOTP/passkey) → on success re-POST with the token → transfer completes. Hard reload
 *         after success (the caller's role changed → refresh session/cookies).
 */
import { useEffect, useState } from "react"
import { useOrg } from "@/hooks/useOrg"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ShieldAlert, ArrowRightLeft } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { TextField, SelectField } from "@/components/forms/fields"
import { StepUpModal } from "@/components/auth/StepUpModal"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface TransferMember { user_id: string; name: string }
type MemberRow = {
  user_id: string
  role: string
  user_profiles: { full_name: string | null; first_name: string | null; last_name: string | null } | null
}

export function TransferOwnershipTab() {
  const { orgId } = useOrg()
  const [members, setMembers] = useState<TransferMember[]>([])
  const [targetId, setTargetId] = useState("")
  const [confirm, setConfirm] = useState("")
  const [transferring, setTransferring] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const { data, error } = await supabase
        .from("user_orgs")
        .select("user_id, role, user_profiles(full_name, first_name, last_name)")
        .eq("org_id", orgId).is("deleted_at", null)
      logQueryError("TransferOwnershipTab user_orgs", error)
      const rows = (data ?? []) as unknown as MemberRow[]
      setMembers(
        rows
          .filter((m) => m.role !== "owner" && m.user_id !== user?.id)
          .map((m) => ({
            user_id: m.user_id,
            name: [m.user_profiles?.first_name, m.user_profiles?.last_name].filter(Boolean).join(" ")
              || m.user_profiles?.full_name || "Unnamed member",
          })),
      )
    })
  }, [orgId])

  async function doTransfer(stepUpToken?: string) {
    if (!orgId || !targetId) return
    setTransferring(true)
    const res = await fetch("/api/team/transfer-ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newOwnerUserId: targetId, orgId, ...(stepUpToken ? { stepUpToken } : {}) }),
    })
    const data = await res.json().catch(() => ({})) as { error?: string; challengeToken?: string }
    setTransferring(false)
    if (res.status === 401 && data.challengeToken) {
      setChallengeToken(data.challengeToken)   // step-up required → open StepUpModal
      return
    }
    if (res.ok) {
      toast.success("Ownership transferred. You are now a Property Manager.")
      window.location.href = "/settings/team"  // role changed — hard reload to refresh session/cookies
    } else {
      toast.error(data.error ?? "Transfer failed")
    }
  }

  function start() {
    if (!targetId) { toast.error("Select a member to transfer to"); return }
    if (confirm !== "TRANSFER") { toast.error('Type "TRANSFER" to confirm'); return }
    void doTransfer()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex gap-3 rounded-[var(--r-button)] border border-warning/30 bg-warning/5 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Transferring ownership is permanent.</p>
          <p>The member you choose becomes the <strong>owner</strong> — the account holder for billing, and the only person who can transfer ownership again. You become a <strong>Property Manager</strong> (admin) and lose owner-only controls.</p>
          <p>For your security, you&apos;ll verify with MFA before the transfer completes.</p>
        </div>
      </div>

      <div className="space-y-4">
        <SelectField
          label="New owner"
          value={targetId}
          onChange={setTargetId}
          options={[
            { value: "", label: members.length ? "Select a member…" : "No other members to transfer to" },
            ...members.map((m) => ({ value: m.user_id, label: m.name })),
          ]}
        />
        <TextField label='Type "TRANSFER" to confirm' value={confirm} onChange={setConfirm} placeholder="TRANSFER" />
        <div className="flex justify-end">
          <ActionButton tone="primary" icon={<ArrowRightLeft className="size-4" />} onClick={start} disabled={transferring || !targetId}>
            {transferring ? "Transferring…" : "Transfer ownership"}
          </ActionButton>
        </div>
      </div>

      {challengeToken && (
        <StepUpModal
          open
          actionLabel="transfer ownership"
          challengeToken={challengeToken}
          onSuccess={() => { void doTransfer(challengeToken) }}
          onCancel={() => setChallengeToken(null)}
        />
      )}
    </div>
  )
}
