"use client"

/**
 * app/(dashboard)/settings/team/TeamInviteButton.tsx — header "Invite" quick-action + modal
 *
 * Route:  rendered in the Team page header (DetailPageLayout actions)
 * Data:   POST /api/team/invite (audited, allowlisted, emails the accept link)
 * Notes:  Small modal — email + role + send/cancel. On success dispatches `pleks:team-invited` so the
 *         Members tab refreshes its pending-invites list without a page reload.
 */
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useOrg } from "@/hooks/useOrg"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import { ActionButton, Modal } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { TextField, SelectField } from "@/components/forms/fields"
import { listAssignableRoles } from "@/lib/auth/orgRoles"

export function TeamInviteButton() {
  const { orgId } = useOrg()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("")
  const [sending, setSending] = useState(false)
  const { data: roles = [] } = useQuery({ queryKey: ["assignable-roles"], queryFn: listAssignableRoles, staleTime: 5 * 60 * 1000 })

  // Default to the first assignable role once loaded.
  useEffect(() => { if (!role && roles.length > 0) setRole(roles[0].slug) }, [roles, role])

  async function send() {
    if (!email.trim()) { toast.error("Enter an email address"); return }
    if (!role) { toast.error("Pick a role"); return }
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
      setEmail(""); setRole(roles[0]?.slug ?? ""); setOpen(false)
      window.dispatchEvent(new CustomEvent("pleks:team-invited"))
    } else {
      const { error } = await res.json() as { error?: string }
      toast.error(error ?? "Failed to send invite")
    }
  }

  return (
    <>
      <AddButton label="Invite" onClick={() => setOpen(true)} />
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
            options={roles.map((r) => ({ value: r.slug, label: r.label }))}
          />
          <p className="text-xs text-muted-foreground">
            They&apos;ll get an email with a link to set up their account and join your team.
          </p>
        </div>
      </Modal>
    </>
  )
}
