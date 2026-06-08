"use client"

/**
 * app/(dashboard)/settings/team/TeamInviteButton.tsx — header "Invite" quick-action + modal
 *
 * Route:  rendered in the Team page header (DetailPageLayout actions)
 * Data:   POST /api/team/invite (audited, allowlisted, emails the accept link)
 * Notes:  Small modal — email + role + send/cancel. On success dispatches `pleks:team-invited` so the
 *         Members tab refreshes its pending-invites list without a page reload.
 */
import { useState } from "react"
import { useOrg } from "@/hooks/useOrg"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import { ActionButton, Modal } from "@/components/ui/actions"
import { TextField, SelectField } from "@/components/forms/fields"
import { INVITABLE_ROLES } from "./roles"

export function TeamInviteButton() {
  const { orgId } = useOrg()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState(INVITABLE_ROLES[0].slug)
  const [sending, setSending] = useState(false)

  async function send() {
    if (!email.trim()) { toast.error("Enter an email address"); return }
    if (!orgId) return
    setSending(true)
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role, orgId }),
    })
    setSending(false)
    if (res.ok) {
      toast.success(`Invite sent to ${email.trim()}`)
      setEmail(""); setRole(INVITABLE_ROLES[0].slug); setOpen(false)
      window.dispatchEvent(new CustomEvent("pleks:team-invited"))
    } else {
      const { error } = await res.json() as { error?: string }
      toast.error(error ?? "Failed to send invite")
    }
  }

  return (
    <>
      <ActionButton tone="primary" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
        Invite
      </ActionButton>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite team member"
        icon={<UserPlus className="size-5" />}
        actions={
          <>
            <ActionButton onClick={() => setOpen(false)}>Cancel</ActionButton>
            <ActionButton tone="primary" onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Send invite"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="Email" type="email" value={email} onChange={setEmail} placeholder="colleague@youragency.co.za" />
          <SelectField
            label="Role"
            value={role}
            onChange={setRole}
            options={INVITABLE_ROLES.map((r) => ({ value: r.slug, label: r.label }))}
          />
          <p className="text-xs text-muted-foreground">
            They&apos;ll get an email with a link to set up their account and join your team.
          </p>
        </div>
      </Modal>
    </>
  )
}
