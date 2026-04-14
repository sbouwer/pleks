"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { useTier } from "@/hooks/useTier"
import { TIER_LIMITS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Trash2, Pencil, X } from "lucide-react"

const ROLE_LABELS: Record<string, string> = {
  owner:               "Owner",
  property_manager:    "Property Manager",
  agent:               "Letting Agent",
  accountant:          "Accountant",
  maintenance_manager: "Maintenance Manager",
}

const ASSIGNABLE_ROLES = [
  { value: "property_manager",    label: "Property Manager" },
  { value: "agent",               label: "Letting Agent" },
  { value: "accountant",          label: "Accountant" },
  { value: "maintenance_manager", label: "Maintenance Manager" },
]

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv"]
const PORTFOLIO_TIERS = new Set(["portfolio", "firm"])

interface Member {
  id: string           // user_orgs.id
  user_id: string
  role: string
  additional_roles: string[]
  user_profiles: {
    full_name: string | null
    title: string | null
    first_name: string | null
    last_name: string | null
    mobile: string | null
    emergency_phone: string | null
    emergency_contact_name: string | null
  } | null
}

interface PendingInvite {
  id: string
  email: string
  role: string
}

// ── Role tag ───────────────────────────────────────────────────────────────────

function RoleTag({ label, onRemove }: Readonly<{ label: string; onRemove?: () => void }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  member: Member
  orgId: string
  isMe: boolean
  isOwner: boolean
  showEmergency: boolean
  onClose: () => void
  onSaved: () => void
}

function EditMemberModal({ member, orgId, isMe, isOwner, showEmergency, onClose, onSaved }: Readonly<EditModalProps>) {
  const p = member.user_profiles
  const [title, setTitle] = useState(p?.title ?? "")
  const [firstName, setFirstName] = useState(p?.first_name ?? "")
  const [lastName, setLastName] = useState(p?.last_name ?? "")
  const [mobile, setMobile] = useState(p?.mobile ?? "")
  const [emergencyPhone, setEmergencyPhone] = useState(p?.emergency_phone ?? "")
  const [emergencyName, setEmergencyName] = useState(p?.emergency_contact_name ?? "")
  const [primaryRole, setPrimaryRole] = useState(member.role)
  const [addlRoles, setAddlRoles] = useState<string[]>(member.additional_roles)
  const [roleToAdd, setRoleToAdd] = useState("")
  const [saving, setSaving] = useState(false)

  const currentRoles = [primaryRole, ...addlRoles]
  const availableToAdd = ASSIGNABLE_ROLES.filter((r) => !currentRoles.includes(r.value))

  function handleRemoveRole(role: string) {
    if (currentRoles.length === 1) return
    if (role === primaryRole) {
      const [next, ...rest] = addlRoles
      setPrimaryRole(next)
      setAddlRoles(rest)
    } else {
      setAddlRoles((prev) => prev.filter((r) => r !== role))
    }
  }

  function handleAddRole() {
    if (!roleToAdd) return
    setAddlRoles((prev) => [...prev, roleToAdd])
    setRoleToAdd("")
  }

  async function handleSave() {
    setSaving(true)
    const body: Record<string, unknown> = {
      userId: member.user_id,
      orgId,
      title: title || null,
      first_name: firstName || null,
      last_name: lastName || null,
      mobile: mobile || null,
    }

    if (!isOwner) {
      body.role = primaryRole
      body.additional_roles = addlRoles
    }

    if (showEmergency && isMe) {
      body.emergency_phone = emergencyPhone || null
      body.emergency_contact_name = emergencyName || null
    }

    const res = await fetch("/api/team/member", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (!res.ok) {
      const { error } = await res.json() as { error: string }
      toast.error(error ?? "Failed to save")
    } else {
      toast.success("Saved")
      onSaved()
      onClose()
    }
  }

  const displayName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.full_name || "Unnamed"

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit — {displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Personal details */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personal Details</p>

            <div className="grid grid-cols-[88px_1fr_1fr] gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Select value={title} onValueChange={(v) => setTitle(v ?? "")}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="–" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">–</SelectItem>
                    {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">First name</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Last name</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Mobile</label>
              <Input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)}
                placeholder="082 000 0000" className="h-8 text-sm" />
            </div>
          </div>

          {/* Roles */}
          {!isOwner && (
            <div className="space-y-2 border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Roles</p>
              <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
                {currentRoles.map((r) => (
                  <RoleTag
                    key={r}
                    label={ROLE_LABELS[r] ?? r}
                    onRemove={currentRoles.length > 1 ? () => handleRemoveRole(r) : undefined}
                  />
                ))}
              </div>
              {availableToAdd.length > 0 && (
                <div className="flex gap-2">
                  <Select value={roleToAdd} onValueChange={(v) => setRoleToAdd(v ?? "")}>
                    <SelectTrigger className="h-8 flex-1 text-sm">
                      <SelectValue placeholder="Add a role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                    disabled={!roleToAdd} onClick={handleAddRole}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Emergency contact — own row only */}
          {showEmergency && isMe && (
            <div className="space-y-2 border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">After-Hours Emergency</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                  <Input type="tel" value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="082 999 8888" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Contact name</label>
                  <Input value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Your name or service" className="h-8 text-sm" />
                </div>
              </div>
            </div>
          )}

          {showEmergency && !isMe && (
            <div className="border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">After-Hours Emergency</p>
              <p className="text-sm text-muted-foreground">
                {p?.emergency_phone
                  ? <>{p.emergency_phone}{p.emergency_contact_name && ` · ${p.emergency_contact_name}`}</>
                  : <span className="italic text-xs">Not set — member configures in their own profile</span>
                }
              </p>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { orgId } = useOrg()
  const { tier } = useTier()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("")
  const [loading, setLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  const usersLimit = TIER_LIMITS[tier].users
  const atLimit = usersLimit !== null && members.length >= usersLimit
  const showEmergency = PORTFOLIO_TIERS.has(tier)

  async function loadMembers(supabase: ReturnType<typeof createClient>) {
    if (!orgId) return

    // Core query — always present columns
    const { data: coreData, error } = await supabase
      .from("user_orgs")
      .select("id, user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
    if (error) { console.error("loadMembers:", error.message); return }

    const base = (coreData as unknown as Omit<Member, "additional_roles">[]) ?? []
    const memberIds = base.map((m) => m.id)
    const userIds = base.map((m) => m.user_id)

    if (memberIds.length === 0) { setMembers([]); return }

    // additional_roles — migration 010_addenda §5; fallback to []
    const rolesMap = new Map<string, string[]>()
    const { data: rolesData } = await supabase
      .from("user_orgs")
      .select("id, additional_roles")
      .in("id", memberIds)
    for (const r of (rolesData as unknown as { id: string; additional_roles: string[] }[]) ?? []) {
      rolesMap.set(r.id, r.additional_roles ?? [])
    }

    // personal + emergency fields — migration 010_addenda §5-6; graceful fallback
    const profileMap = new Map<string, Partial<Member["user_profiles"]>>()
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("id, title, first_name, last_name, mobile, emergency_phone, emergency_contact_name")
      .in("id", userIds)
    for (const p of (profileData as unknown as (Partial<Member["user_profiles"]> & { id: string })[]) ?? []) {
      profileMap.set(p.id, p)
    }

    setMembers(base.map((m) => ({
      ...m,
      additional_roles: rolesMap.get(m.id) ?? [],
      user_profiles: {
        full_name: (m.user_profiles as { full_name: string | null } | null)?.full_name ?? null,
        ...profileMap.get(m.user_id),
      } as Member["user_profiles"],
    })))
  }

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
    loadMembers(supabase)

    supabase
      .from("invites")
      .select("id, email, role")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .then(({ data }) => setPendingInvites((data as unknown as PendingInvite[]) ?? []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function handleRemove(memberOrgId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("user_orgs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", memberOrgId)
    if (error) { toast.error("Failed to remove member") }
    else { toast.success("Member removed"); loadMembers(supabase) }
  }

  async function handleRevokeInvite(inviteId: string) {
    const supabase = createClient()
    const { error } = await supabase.from("invites").delete().eq("id", inviteId)
    if (error) { toast.error("Failed to revoke invite") }
    else { toast.success("Invite revoked"); setPendingInvites((p) => p.filter((i) => i.id !== inviteId)) }
  }

  async function handleInvite() {
    if (!inviteEmail || !inviteRole || !orgId) return
    if (atLimit) { toast.error("User limit reached. Upgrade your plan to add more team members."); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from("invites").insert({
      org_id: orgId, email: inviteEmail.trim(), role: inviteRole, invited_by: user?.id,
    })
    if (error) {
      toast.error("Failed to send invite")
    } else {
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail(""); setInviteRole("")
      const { data } = await supabase.from("invites").select("id, email, role")
        .eq("org_id", orgId).is("accepted_at", null)
      setPendingInvites((data as unknown as PendingInvite[]) ?? [])
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Team</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            Members ({members.length}{usersLimit ? `/${usersLimit}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((m) => {
              const isMe = m.user_id === currentUserId
              const isOwner = m.role === "owner"
              const canRemove = !isMe && !isOwner
              const allRoles = [m.role, ...(m.additional_roles ?? [])]
              const displayName = [m.user_profiles?.first_name, m.user_profiles?.last_name].filter(Boolean).join(" ")
                || m.user_profiles?.full_name || "Unnamed"
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {displayName}
                        {isMe && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {allRoles.map((r) => (
                          <span key={r} className="inline-block rounded-full bg-muted/50 border border-border/40 px-2 py-0.5 text-xs">
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </div>
                    {m.user_profiles?.mobile && (
                      <p className="text-xs text-muted-foreground mt-0.5">{m.user_profiles.mobile}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingMember(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canRemove && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {editingMember && orgId && (
        <EditMemberModal
          key={editingMember.id}
          member={editingMember}
          orgId={orgId}
          isMe={editingMember.user_id === currentUserId}
          isOwner={editingMember.role === "owner"}
          showEmergency={showEmergency}
          onClose={() => setEditingMember(null)}
          onSaved={() => loadMembers(createClient())}
        />
      )}

      {pendingInvites.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Pending Invites</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[inv.role] ?? inv.role} · pending</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevokeInvite(inv.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Invite team member</CardTitle></CardHeader>
        <CardContent>
          {atLimit ? (
            <p className="text-sm text-muted-foreground">
              You&apos;ve reached the user limit for your plan.{" "}
              <a href="/settings/billing" className="text-brand hover:underline">Upgrade</a> to add more.
            </p>
          ) : (
            <div className="flex gap-2">
              <Input type="email" placeholder="Email address" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }}
                className="flex-1" />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? "")}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={loading || !inviteEmail || !inviteRole}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
