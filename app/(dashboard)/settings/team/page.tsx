"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { useTier } from "@/hooks/useTier"
import { usePermissions } from "@/hooks/usePermissions"
import { TIER_LIMITS } from "@/lib/constants"
import { cn } from "@/lib/utils"
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
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react"

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner:               "Owner",
  property_manager:    "Property Manager",
  agent:               "Letting Agent",
  accountant:          "Accountant",
  maintenance_manager: "Maintenance Manager",
}

// Reverse map: display label → system slug (for storing back as slug where possible)
const ROLE_LABEL_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([k, v]) => [v, k])
)

const DEFAULT_ROLES = Object.values(ROLE_LABELS)
const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv"]
const PORTFOLIO_TIERS = new Set(["portfolio", "firm"])

// ── Helpers ────────────────────────────────────────────────────────────────────

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

function getMemberDisplayName(m: Member): string {
  return (
    [m.user_profiles?.first_name, m.user_profiles?.last_name].filter(Boolean).join(" ") ||
    m.user_profiles?.full_name ||
    "Unnamed"
  )
}

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface Member {
  id: string
  user_id: string
  role: string
  is_admin: boolean
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

type SortCol = "name" | "role"
type SortDir = "asc" | "desc"

// ── Role combobox ──────────────────────────────────────────────────────────────
// Combines a free-text input with quick-pick chips from the org's role library.
// Selecting a chip or typing sets the role value directly.

function RoleCombobox({ value, onChange, orgRoles }: Readonly<{
  value: string
  onChange: (v: string) => void
  orgRoles: string[]
}>) {
  const [inputVal, setInputVal] = useState(getRoleLabel(value))

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setInputVal(e.target.value)
    onChange(e.target.value)
  }

  function handlePick(role: string) {
    setInputVal(role)
    onChange(role)
  }

  return (
    <div className="space-y-2">
      <Input
        value={inputVal}
        onChange={handleInput}
        placeholder="Type or select a role…"
        className="h-8 text-sm"
      />
      {orgRoles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {orgRoles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handlePick(r)}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                inputVal === r
                  ? "bg-brand/10 border-brand/50 text-brand"
                  : "border-border/50 text-muted-foreground hover:border-brand/30 hover:text-foreground"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sort icon ──────────────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }: Readonly<{ col: SortCol; sortCol: SortCol; sortDir: SortDir }>) {
  if (col !== sortCol) return <ArrowUpDown className="h-3 w-3 opacity-40" />
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  member: Member
  orgId: string
  orgRoles: string[]
  isMe: boolean
  isOwner: boolean
  showEmergency: boolean
  onClose: () => void
  onSaved: () => void
}

function EditMemberModal({
  member, orgId, orgRoles, isMe, isOwner, showEmergency, onClose, onSaved,
}: Readonly<EditModalProps>) {
  const p = member.user_profiles
  const [title, setTitle]               = useState(p?.title ?? "")
  const [firstName, setFirstName]       = useState(p?.first_name ?? "")
  const [lastName, setLastName]         = useState(p?.last_name ?? "")
  const [mobile, setMobile]             = useState(p?.mobile ?? "")
  const [emergencyPhone, setEmPhone]    = useState(p?.emergency_phone ?? "")
  const [emergencyName, setEmName]      = useState(p?.emergency_contact_name ?? "")
  const [roleInput, setRoleInput]       = useState(getRoleLabel(member.role))
  const [saving, setSaving]             = useState(false)

  async function handleSave() {
    setSaving(true)
    const body: Record<string, unknown> = {
      userId: member.user_id, orgId,
      title: title || null,
      first_name: firstName || null,
      last_name: lastName || null,
      mobile: mobile || null,
    }

    if (!isOwner) {
      // Map display label back to system slug where possible; otherwise save as-is
      body.role = ROLE_LABEL_TO_SLUG[roleInput] ?? roleInput
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

  const displayName = getMemberDisplayName(member)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit — {displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1 overflow-y-auto max-h-[70vh] pr-1">

          {/* Personal details */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Personal Details
            </p>
            <div className="grid grid-cols-[88px_1fr_1fr] gap-2">
              <div>
                <label htmlFor="edit-title" className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Select value={title} onValueChange={(v) => setTitle(v ?? "")}>
                  <SelectTrigger id="edit-title" className="h-8 text-sm">
                    <SelectValue placeholder="–" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">–</SelectItem>
                    {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="edit-first" className="text-xs text-muted-foreground mb-1 block">First name</label>
                <Input id="edit-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label htmlFor="edit-last" className="text-xs text-muted-foreground mb-1 block">Last name</label>
                <Input id="edit-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="edit-mobile" className="text-xs text-muted-foreground mb-1 block">Mobile</label>
              <Input id="edit-mobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)}
                placeholder="082 000 0000" className="h-8 text-sm" />
            </div>
          </div>

          {/* Role — free-text + quick-pick chips */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</p>
            {isOwner ? (
              <p className="text-sm text-muted-foreground">
                Owner — role cannot be changed here. Use ownership transfer to assign a new owner.
              </p>
            ) : (
              <>
                <RoleCombobox value={member.role} onChange={setRoleInput} orgRoles={orgRoles} />
                <p className="text-xs text-muted-foreground">
                  Type a custom title or pick from the list. New labels are saved to your org&apos;s role library.
                </p>
              </>
            )}
          </div>

          {/* Emergency contact — own row only, portfolio/firm tiers */}
          {showEmergency && isMe && (
            <div className="space-y-2 border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                After-Hours Emergency
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="edit-em-phone" className="text-xs text-muted-foreground mb-1 block">Phone</label>
                  <Input id="edit-em-phone" type="tel" value={emergencyPhone}
                    onChange={(e) => setEmPhone(e.target.value)}
                    placeholder="082 999 8888" className="h-8 text-sm" />
                </div>
                <div>
                  <label htmlFor="edit-em-name" className="text-xs text-muted-foreground mb-1 block">Contact name</label>
                  <Input id="edit-em-name" value={emergencyName}
                    onChange={(e) => setEmName(e.target.value)}
                    placeholder="Your name or service" className="h-8 text-sm" />
                </div>
              </div>
            </div>
          )}

          {showEmergency && !isMe && (
            <div className="border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                After-Hours Emergency
              </p>
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

// ── Member row (compact list — owner/steward/portfolio tiers) ──────────────────

function MemberRow({ member, currentUserId, callerIsOwner, onEdit, onRemove, onToggleAdmin }: Readonly<{
  member: Member
  currentUserId: string | null
  callerIsOwner: boolean
  onEdit: (m: Member) => void
  onRemove: (id: string, orgId?: string) => void
  onToggleAdmin: (m: Member) => void
}>) {
  const isMe     = member.user_id === currentUserId
  const isOwner  = member.role === "owner"
  const canRemove = !isMe && !isOwner

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {getMemberDisplayName(member)}
            {isMe && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
          </span>
          <span className="inline-block rounded-full bg-muted/50 border border-border/40 px-2 py-0.5 text-xs">
            {getRoleLabel(member.role)}
          </span>
          {(isOwner || member.is_admin) && (
            <span className="inline-block rounded-full bg-brand/10 border border-brand/30 px-2 py-0.5 text-xs text-brand">
              {isOwner ? "Owner" : "Admin"}
            </span>
          )}
        </div>
        {member.user_profiles?.mobile && (
          <p className="text-xs text-muted-foreground mt-0.5">{member.user_profiles.mobile}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {callerIsOwner && !isOwner && (
          <Button variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
            onClick={() => onToggleAdmin(member)}
            title={member.is_admin ? "Revoke admin" : "Grant admin"}>
            {member.is_admin ? "Admin ✓" : "Admin"}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(member)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(member.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Firm member table (firm tier — search, filter, sortable columns) ────────────

interface FirmTableProps {
  members: Member[]
  search: string
  onSearch: (v: string) => void
  roleFilter: string
  onRoleFilter: (v: string) => void
  uniqueRoles: string[]
  sortCol: SortCol
  sortDir: SortDir
  onSort: (col: SortCol) => void
  currentUserId: string | null
  callerIsOwner: boolean
  onEdit: (m: Member) => void
  onRemove: (id: string) => void
  onToggleAdmin: (m: Member) => void
}

function FirmMemberTable({
  members, search, onSearch, roleFilter, onRoleFilter,
  uniqueRoles, sortCol, sortDir, onSort, currentUserId, callerIsOwner, onEdit, onRemove, onToggleAdmin,
}: Readonly<FirmTableProps>) {
  return (
    <div className="space-y-3">
      {/* Search + role filter */}
      <div className="flex gap-2">
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 h-8 text-sm"
        />
        <Select value={roleFilter} onValueChange={(v) => onRoleFilter(v ?? "")}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All roles</SelectItem>
            {uniqueRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-2/5">
                <button type="button" onClick={() => onSort("name")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Name <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                <button type="button" onClick={() => onSort("role")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Role <SortIcon col="role" sortCol={sortCol} sortDir={sortDir} />
                </button>
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Mobile</th>
              {callerIsOwner && <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Admin</th>}
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={callerIsOwner ? 5 : 4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No members match your search.
                </td>
              </tr>
            )}
            {members.map((m) => {
              const isMe      = m.user_id === currentUserId
              const isOwner   = m.role === "owner"
              const canRemove = !isMe && !isOwner
              return (
                <tr key={m.id}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium">
                    {getMemberDisplayName(m)}
                    {isMe && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{getRoleLabel(m.role)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.user_profiles?.mobile ?? "—"}</td>
                  {callerIsOwner && (
                    <td className="px-4 py-2.5">
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground">always</span>
                      ) : (
                        <Button variant="ghost" size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => onToggleAdmin(m)}
                          title={m.is_admin ? "Revoke admin" : "Grant admin"}>
                          {m.is_admin ? "✓ Admin" : "—"}
                        </Button>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canRemove && (
                        <Button variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemove(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { orgId }           = useOrg()
  const { tier }            = useTier()
  const { isOwner: callerIsOwner } = usePermissions()

  const [members, setMembers]           = useState<Member[]>([])
  const [orgRoles, setOrgRoles]         = useState<string[]>(DEFAULT_ROLES)
  const [pendingInvites, setPending]    = useState<PendingInvite[]>([])
  const [inviteEmail, setInviteEmail]   = useState("")
  const [inviteRole, setInviteRole]     = useState("")
  const [loading, setLoading]           = useState(false)
  const [currentUserId, setCurrentUser] = useState<string | null>(null)
  const [editingMember, setEditing]     = useState<Member | null>(null)
  const [search, setSearch]             = useState("")
  const [roleFilter, setRoleFilter]     = useState("")
  const [sortCol, setSortCol]           = useState<SortCol>("name")
  const [sortDir, setSortDir]           = useState<SortDir>("asc")

  const isFirm      = tier === "firm"
  const usersLimit  = TIER_LIMITS[tier].users
  const atLimit     = usersLimit !== null && members.length >= usersLimit
  const showEmergency = PORTFOLIO_TIERS.has(tier)

  // ── Derived lists ────────────────────────────────────────────────────────────

  const uniqueRoles = useMemo(() => {
    const seen = new Set<string>()
    const roles: string[] = []
    for (const m of members) {
      const label = getRoleLabel(m.role)
      if (!seen.has(label)) { seen.add(label); roles.push(label) }
    }
    return roles.sort()
  }, [members])

  const filteredMembers = useMemo(() => {
    let list = members
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((m) => getMemberDisplayName(m).toLowerCase().includes(q))
    }
    if (roleFilter) {
      list = list.filter((m) => getRoleLabel(m.role) === roleFilter)
    }
    return [...list].sort((a, b) => {
      const va = sortCol === "name" ? getMemberDisplayName(a) : getRoleLabel(a.role)
      const vb = sortCol === "name" ? getMemberDisplayName(b) : getRoleLabel(b.role)
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [members, search, roleFilter, sortCol, sortDir])

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadMembers(supabase: ReturnType<typeof createClient>) {
    if (!orgId) return
    const { data: coreData, error } = await supabase
      .from("user_orgs")
      .select("id, user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
    if (error) { console.error("loadMembers:", error.message); return }

    const base = (coreData as unknown as Omit<Member, "additional_roles" | "is_admin">[]) ?? []
    const memberIds = base.map((m) => m.id)
    const userIds   = base.map((m) => m.user_id)
    if (memberIds.length === 0) { setMembers([]); return }

    // additional_roles + is_admin — §5/§8 migrations; graceful fallback
    const rolesMap   = new Map<string, string[]>()
    const adminMap   = new Map<string, boolean>()
    const { data: rolesData } = await supabase
      .from("user_orgs").select("id, additional_roles, is_admin").in("id", memberIds)
    for (const r of (rolesData as unknown as { id: string; additional_roles: string[]; is_admin: boolean }[]) ?? []) {
      rolesMap.set(r.id, r.additional_roles ?? [])
      adminMap.set(r.id, r.is_admin ?? false)
    }

    // personal + emergency fields — §5-6 migration; graceful fallback
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
      is_admin: adminMap.get(m.id) ?? false,
      additional_roles: rolesMap.get(m.id) ?? [],
      user_profiles: {
        full_name: (m.user_profiles as { full_name: string | null } | null)?.full_name ?? null,
        ...profileMap.get(m.user_id),
      } as Member["user_profiles"],
    })))
  }

  async function loadOrgRoles(supabase: ReturnType<typeof createClient>) {
    if (!orgId) return
    const { data } = await supabase
      .from("organisations").select("custom_roles").eq("id", orgId).single()
    const saved = (data as unknown as { custom_roles: string[] } | null)?.custom_roles ?? []
    // Merge: system defaults first, then org-specific custom labels
    setOrgRoles([...DEFAULT_ROLES, ...saved.filter((r) => !DEFAULT_ROLES.includes(r))])
  }

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user?.id ?? null))
    loadMembers(supabase)
    loadOrgRoles(supabase)
    supabase.from("invites").select("id, email, role")
      .eq("org_id", orgId).is("accepted_at", null)
      .then(({ data }) => setPending((data as unknown as PendingInvite[]) ?? []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
  }

  async function handleRemove(memberOrgId: string) {
    if (!orgId) return
    const res = await fetch("/api/team/member", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberOrgId, orgId }),
    })
    if (!res.ok) {
      const { error } = await res.json() as { error: string }
      toast.error(error ?? "Failed to remove member")
    } else {
      toast.success("Member removed")
      loadMembers(createClient())
    }
  }

  async function handleToggleAdmin(member: Member) {
    if (!orgId) return
    const res = await fetch("/api/team/member", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.user_id, orgId, is_admin: !member.is_admin }),
    })
    if (!res.ok) {
      const { error } = await res.json() as { error: string }
      toast.error(error ?? "Failed to update admin status")
    } else {
      toast.success(member.is_admin ? "Admin access revoked" : "Admin access granted")
      loadMembers(createClient())
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!orgId) return
    const res = await fetch("/api/team/invite", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId, orgId }),
    })
    if (!res.ok) {
      const { error } = await res.json() as { error: string }
      toast.error(error ?? "Failed to revoke invite")
    } else {
      toast.success("Invite revoked")
      setPending((p) => p.filter((i) => i.id !== inviteId))
    }
  }

  async function handleInvite() {
    if (!inviteEmail || !inviteRole || !orgId) return
    if (atLimit) { toast.error("User limit reached. Upgrade to add more members."); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const roleSlug = ROLE_LABEL_TO_SLUG[inviteRole] ?? inviteRole
    const { error } = await supabase.from("invites").insert({
      org_id: orgId, email: inviteEmail.trim(), role: roleSlug, invited_by: user?.id,
    })
    if (error) {
      toast.error("Failed to send invite")
    } else {
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail(""); setInviteRole("")
      const { data } = await supabase.from("invites").select("id, email, role")
        .eq("org_id", orgId).is("accepted_at", null)
      setPending((data as unknown as PendingInvite[]) ?? [])
    }
    setLoading(false)
  }

  function handleSaved() {
    const supabase = createClient()
    loadMembers(supabase)
    loadOrgRoles(supabase)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

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
          {isFirm ? (
            <FirmMemberTable
              members={filteredMembers}
              search={search} onSearch={setSearch}
              roleFilter={roleFilter} onRoleFilter={setRoleFilter}
              uniqueRoles={uniqueRoles}
              sortCol={sortCol} sortDir={sortDir} onSort={toggleSort}
              currentUserId={currentUserId}
              callerIsOwner={callerIsOwner}
              onEdit={setEditing}
              onRemove={handleRemove}
              onToggleAdmin={handleToggleAdmin}
            />
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((m) => (
                <MemberRow key={m.id} member={m} currentUserId={currentUserId}
                  callerIsOwner={callerIsOwner}
                  onEdit={setEditing} onRemove={handleRemove} onToggleAdmin={handleToggleAdmin} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editingMember && orgId && (
        <EditMemberModal
          key={editingMember.id}
          member={editingMember}
          orgId={orgId}
          orgRoles={orgRoles}
          isMe={editingMember.user_id === currentUserId}
          isOwner={editingMember.role === "owner"}
          showEmergency={showEmergency}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {pendingInvites.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Pending Invites</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(inv.role)} · pending</p>
                  </div>
                  <Button variant="ghost" size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }}
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Role</p>
                <RoleCombobox
                  value={inviteRole}
                  onChange={setInviteRole}
                  orgRoles={orgRoles.filter((r) => r !== "Owner")}
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={loading || !inviteEmail || !inviteRole}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Send invite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
