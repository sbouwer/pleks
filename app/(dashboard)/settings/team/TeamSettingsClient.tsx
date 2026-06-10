"use client"

/**
 * app/(dashboard)/settings/team/TeamSettingsClient.tsx — Members tab (client component)
 *
 * Route:  /settings/team?tab=members (rendered by page.tsx; Invite is the header button, Transfer its own tab)
 * Auth:   Rendered inside gateway-protected server wrapper; org-type guard in page.tsx
 * Data:   user_orgs (members + pending invites) via /api/team/member, /api/team/invite; roles via
 *         listAssignableRoles (tier-gated picker) + getOrgRoles (full-library label resolver).
 * Notes:  Exports MembersTab. Archive is owner-only; pending-invite list refreshes on the
 *         `pleks:team-invited` event the header TeamInviteButton dispatches. The role picker is slug-based
 *         and tier-gated; custom roles are created only on the owner-only Roles tab (no free-text here).
 */

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { useTier } from "@/hooks/useTier"
import { usePermissions } from "@/hooks/usePermissions"
import { cn } from "@/lib/utils"
import { ActionButton, IconButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Trash2, RotateCcw, Archive } from "lucide-react"
import { EditButton, DeleteButton } from "@/components/ui/actions"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { getMemberEmails } from "@/lib/actions/teamMembers"
import { getAgentWorkload } from "@/lib/work/reassign"
import { ReassignBeforeArchiveModal } from "@/components/work/ReassignBeforeArchiveModal"
import { useStepUpSubmit } from "@/components/auth/useStepUpSubmit"
import { listAssignableRoles, getOrgRoles } from "@/lib/auth/orgRoles"
import { BUILTIN_ROLES } from "@/lib/auth/capabilities"

// ── Constants ──────────────────────────────────────────────────────────────────

type AssignableRole = { slug: string; label: string; group: string | null }

// Seed the display-label map from the built-ins so roles render their label immediately; getOrgRoles()
// (the full, tier-INDEPENDENT library incl. per-org overrides + custom roles) refines it on load. The
// picker is tier-gated (listAssignableRoles); the label resolver is not — a member on a downgraded-out or
// custom role must still show its label, never a raw slug (D-3B-01).
const BUILTIN_LABELS: Record<string, string> = {
  owner: "Owner",
  ...Object.fromEntries(BUILTIN_ROLES.map((r) => [r.slug, r.label])),
}

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv"]
const PORTFOLIO_TIERS = new Set(["portfolio", "firm"])

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Role combobox ──────────────────────────────────────────────────────────────
// Picker over the org's ASSIGNABLE (tier-gated) roles. value/onChange are SLUGs; typing filters by label.
// No free-text "add" — custom roles are created only on the owner-only Roles tab.

function RoleCombobox({ value, onChange, assignable, labelOf }: Readonly<{
  value: string
  onChange: (slug: string) => void
  assignable: AssignableRole[]
  labelOf: (slug: string) => string
}>) {
  const [inputVal, setInputVal]   = useState(labelOf(value))
  const [open, setOpen]           = useState(false)
  const [dropRect, setDropRect]   = useState<DOMRect | null>(null)
  const containerRef              = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  const measureAndOpen = useCallback(() => {
    if (inputRef.current) setDropRect(inputRef.current.getBoundingClientRect())
    setOpen(true)
  }, [])

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const query = inputVal.trim().toLowerCase()

  const groups = useMemo(() => {
    const byGroup = new Map<string, AssignableRole[]>()
    for (const r of assignable) {
      const g = r.group ?? "Other"
      const arr = byGroup.get(g) ?? []
      arr.push(r)
      byGroup.set(g, arr)
    }
    return [...byGroup.entries()].map(([group, roles]) => ({ group, roles }))
  }, [assignable])

  const filteredGroups = groups
    .map((g) => ({
      group: g.group,
      roles: query ? g.roles.filter((r) => r.label.toLowerCase().includes(query)) : g.roles,
    }))
    .filter((g) => g.roles.length > 0)

  const hasResults = filteredGroups.length > 0

  function pick(role: AssignableRole) {
    setInputVal(role.label)
    onChange(role.slug)
    setOpen(false)
  }

  const dropdown = open && dropRect && (
    <div
      style={{
        position: "fixed",
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
      }}
      className="rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto"
    >
      {hasResults ? (
        <div className="py-1">
          {filteredGroups.map((g) => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground
                            uppercase tracking-wider">
                {g.group}
              </p>
              {g.roles.map((role) => (
                <button
                  key={role.slug}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); pick(role) }}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-sm transition-colors",
                    inputVal === role.label
                      ? "bg-brand/10 text-brand"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  {role.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground">No roles match.</p>
      )}
    </div>
  )

  return (
    <div ref={containerRef}>
      <Input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); measureAndOpen() }}
        onFocus={measureAndOpen}
        placeholder="Select a role…"
        className="h-8 text-sm"
        autoComplete="off"
      />
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  )
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  member: Member
  orgId: string
  assignable: AssignableRole[]
  labelOf: (slug: string) => string
  isMe: boolean
  isOwner: boolean
  showEmergency: boolean
  onClose: () => void
  onSaved: () => void
}

function EditMemberModal({
  member, orgId, assignable, labelOf, isMe, isOwner, showEmergency, onClose, onSaved,
}: Readonly<EditModalProps>) {
  const p = member.user_profiles
  const [title, setTitle]               = useState(p?.title ?? "")
  const [firstName, setFirstName]       = useState(p?.first_name ?? "")
  const [lastName, setLastName]         = useState(p?.last_name ?? "")
  const [mobile, setMobile]             = useState(p?.mobile ?? "")
  const [emergencyPhone, setEmPhone]    = useState(p?.emergency_phone ?? "")
  const [emergencyName, setEmName]      = useState(p?.emergency_contact_name ?? "")
  const [roleSlug, setRoleSlug]         = useState(member.role)
  const [saving, setSaving]             = useState(false)
  const { submit, stepUpModal } = useStepUpSubmit("change a member's role")  // role change is re-auth-gated (Finding 1.2)

  async function handleSave() {
    setSaving(true)
    const body: Record<string, unknown> = {
      userId: member.user_id, orgId,
      title: title || null,
      first_name: firstName || null,
      last_name: lastName || null,
      mobile: mobile || null,
    }

    // roleSlug is always a valid slug (only set by picking from the tier-gated list); server re-validates.
    if (!isOwner) body.role = roleSlug

    if (showEmergency && isMe) {
      body.emergency_phone = emergencyPhone || null
      body.emergency_contact_name = emergencyName || null
    }

    // A role change 401s for step-up; pure profile self-edits pass straight through (no modal).
    await submit(
      (stepUpToken) => fetch("/api/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(stepUpToken ? { stepUpToken } : {}) }),
      }),
      () => { toast.success("Saved"); onSaved(); onClose() },
    )
    setSaving(false)
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

          {/* Role — tier-gated picker (slug-based) */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</p>
            {isOwner ? (
              <p className="text-sm text-muted-foreground">
                Owner — role cannot be changed here. Use ownership transfer to assign a new owner.
              </p>
            ) : (
              <>
                <RoleCombobox value={member.role} onChange={setRoleSlug} assignable={assignable} labelOf={labelOf} />
                <p className="text-xs text-muted-foreground">
                  Pick from your organisation&apos;s roles. New roles are created on the Roles tab.
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
          <ActionButton tone="secondary" onClick={onClose} disabled={saving}>Cancel</ActionButton>
          <ActionButton tone="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</ActionButton>
        </DialogFooter>
      </DialogContent>
      {stepUpModal}
    </Dialog>
  )
}

// Loading skeleton — mirrors the members table (same columns + responsive visibility) so the layout doesn't
// flash an empty "0 members" state before data arrives.
function MembersSkeleton() {
  const rows = ["a", "b", "c", "d"]
  return (
    <ListCard fill>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2.5 text-left"><Skeleton className="h-4 w-16" /></th>
            <th className="px-4 py-2.5 text-left"><Skeleton className="h-4 w-12" /></th>
            <th className="hidden px-4 py-2.5 text-left lg:table-cell"><Skeleton className="h-4 w-14" /></th>
            <th className="hidden px-4 py-2.5 text-left md:table-cell"><Skeleton className="h-4 w-14" /></th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
              <td className="hidden px-4 py-3 lg:table-cell"><Skeleton className="h-5 w-48" /></td>
              <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="h-5 w-28" /></td>
              <td className="px-4 py-3"><Skeleton className="ml-auto h-5 w-16" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function MembersTab() {
  const { orgId }           = useOrg()
  const { tier }            = useTier()
  const { isOwner: callerIsOwner } = usePermissions()

  const [members, setMembers]           = useState<Member[]>([])
  const [loading, setLoading]           = useState(true)   // skeleton until the first member load resolves
  const [assignableRoles, setAssignable] = useState<AssignableRole[]>([])
  const [roleLabels, setRoleLabels]     = useState<Record<string, string>>(BUILTIN_LABELS)
  const [pendingInvites, setPending]    = useState<PendingInvite[]>([])
  const [currentUserId, setCurrentUser] = useState<string | null>(null)
  const [editingMember, setEditing]     = useState<Member | null>(null)
  const [search, setSearch]             = useState("")
  const [roleFilter, setRoleFilter]     = useState("")
  const [status, setStatus]             = useState<"active" | "inactive">("active")
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [emails, setEmails]             = useState<Record<string, string>>({})
  const [archivingMember, setArchivingMember] = useState<Member | null>(null)
  const [archiveWorkload, setArchiveWorkload] = useState({ workItems: 0, properties: 0 })
  const { sortKey, sortDir, onSort }    = useListSort<"name" | "role">("name")
  const { submit: submitAccess, stepUpModal: accessStepUpModal } = useStepUpSubmit("change team access")  // remove / admin-toggle are re-auth-gated (Finding 1.2)

  const showEmergency = PORTFOLIO_TIERS.has(tier)

  // Full-library label resolver (tier-independent): any assigned slug → its label, never a raw slug.
  const roleLabelOf = useCallback((slug: string) => roleLabels[slug] ?? slug, [roleLabels])

  // ── Derived lists ────────────────────────────────────────────────────────────

  const uniqueRoles = useMemo(() => {
    const seen = new Set<string>()
    const roles: string[] = []
    for (const m of members) {
      const label = roleLabelOf(m.role)
      if (!seen.has(label)) { seen.add(label); roles.push(label) }
    }
    return roles.sort()
  }, [members, roleLabelOf])

  const filteredMembers = useMemo(() => {
    let list = members
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((m) => getMemberDisplayName(m).toLowerCase().includes(q))
    }
    if (roleFilter) {
      list = list.filter((m) => roleLabelOf(m.role) === roleFilter)
    }
    return [...list].sort((a, b) => {
      const va = sortKey === "name" ? getMemberDisplayName(a) : roleLabelOf(a.role)
      const vb = sortKey === "name" ? getMemberDisplayName(b) : roleLabelOf(b.role)
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [members, search, roleFilter, sortKey, sortDir, roleLabelOf])

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadMembers(supabase: ReturnType<typeof createClient>, statusArg: "active" | "inactive" = status) {
    if (!orgId) return
    const query = supabase
      .from("user_orgs")
      .select("id, user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
    const { data: coreData, error } = await (statusArg === "active"
      ? query.is("deleted_at", null)
      : query.not("deleted_at", "is", null))
    if (error) { console.error("loadMembers:", error.message); return }

    const base = (coreData as unknown as Omit<Member, "additional_roles" | "is_admin">[]) ?? []
    const memberIds = base.map((m) => m.id)
    const userIds   = base.map((m) => m.user_id)
    if (memberIds.length === 0) { setMembers([]); return }

    // additional_roles + is_admin — §5/§8 migrations; graceful fallback
    const rolesMap   = new Map<string, string[]>()
    const adminMap   = new Map<string, boolean>()
    const { data: rolesData, error: rolesDataError } = await supabase
      .from("user_orgs").select("id, additional_roles, is_admin").in("id", memberIds)
    logQueryError("loadMembers user_orgs", rolesDataError)
    for (const r of (rolesData as unknown as { id: string; additional_roles: string[]; is_admin: boolean }[]) ?? []) {
      rolesMap.set(r.id, r.additional_roles ?? [])
      adminMap.set(r.id, r.is_admin ?? false)
    }

    // personal + emergency fields — §5-6 migration; graceful fallback
    const profileMap = new Map<string, Partial<Member["user_profiles"]>>()
    const { data: profileData, error: profileDataError } = await supabase
      .from("user_profiles")
      .select("id, title, first_name, last_name, mobile, emergency_phone, emergency_contact_name")
      .in("id", userIds)
    logQueryError("loadMembers user_profiles", profileDataError)
    for (const profile of (profileData as unknown as (Partial<Member["user_profiles"]> & { id: string })[]) ?? []) {
      profileMap.set(profile.id, profile)
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

  // Roles: the tier-gated assignable list (picker) + the full-library label map (display).
  function loadRoles() {
    listAssignableRoles().then(setAssignable).catch(() => {})
    getOrgRoles()
      .then((roles) => setRoleLabels({ owner: "Owner", ...Object.fromEntries(roles.map((r) => [r.slug, r.label])) }))
      .catch(() => {})
  }

  // Refresh pending invites — on mount + when the header TeamInviteButton dispatches pleks:team-invited.
  async function reloadPending() {
    if (!orgId) return
    const supabase = createClient()
    const { data, error } = await supabase.from("invites").select("id, email, role")
      .eq("org_id", orgId).is("accepted_at", null)
    logQueryError("reloadPending invites", error)
    setPending((data as unknown as PendingInvite[]) ?? [])
  }

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user?.id ?? null))
    loadMembers(supabase).finally(() => setLoading(false))
    loadRoles()
    reloadPending()
    getMemberEmails().then(setEmails).catch(() => {})
    const onInvited = () => { reloadPending() }
    window.addEventListener("pleks:team-invited", onInvited)
    return () => window.removeEventListener("pleks:team-invited", onInvited)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function changeStatus(s: "active" | "inactive") {
    setStatus(s)
    setRoleFilter("")
    loadMembers(createClient(), s)
  }

  async function handleReactivate(memberOrgId: string) {
    if (!orgId) return
    setReactivatingId(memberOrgId)
    const res = await fetch("/api/team/member", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberOrgId, orgId, reactivate: true }),
    })
    setReactivatingId(null)
    if (!res.ok) {
      const { error } = await res.json() as { error?: string }
      toast.error(error ?? "Failed to reactivate member")
    } else {
      toast.success("Member reactivated")
      loadMembers(createClient(), "inactive")
    }
  }

  async function handleRemove(memberOrgId: string) {
    if (!orgId) return
    await submitAccess(
      (stepUpToken) => fetch("/api/team/member", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberOrgId, orgId, ...(stepUpToken ? { stepUpToken } : {}) }),
      }),
      () => { toast.success("Member removed"); loadMembers(createClient()) },
    )
  }

  // Archive flow: if the member owns work/properties, reassign first (ADDENDUM_TEAMS §1d two-flow); else
  // archive directly.
  async function startArchive(m: Member) {
    const workload = await getAgentWorkload(m.user_id)
    if (workload.workItems + workload.properties > 0) {
      setArchiveWorkload(workload)
      setArchivingMember(m)
    } else {
      handleRemove(m.id)
    }
  }

  async function handleToggleAdmin(member: Member) {
    if (!orgId) return
    await submitAccess(
      (stepUpToken) => fetch("/api/team/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.user_id, orgId, is_admin: !member.is_admin, ...(stepUpToken ? { stepUpToken } : {}) }),
      }),
      () => { toast.success(member.is_admin ? "Admin access revoked" : "Admin access granted"); loadMembers(createClient()) },
    )
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
      setPending((prev) => prev.filter((i) => i.id !== inviteId))
    }
  }

  function handleSaved() {
    loadMembers(createClient())
    loadRoles()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name…"
        filters={
          <>
            <ToolbarFilter
              label="Status"
              selected={[status]}
              onChange={(next) => changeStatus((next[0] as "active" | "inactive") ?? "active")}
              options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
            />
            {status === "active" && uniqueRoles.length > 0 && (
              <ToolbarFilter
                label="Role"
                selected={roleFilter ? [roleFilter] : []}
                onChange={(next) => setRoleFilter(next[0] ?? "")}
                options={uniqueRoles.map((r) => ({ value: r, label: r }))}
              />
            )}
          </>
        }
      />

      {!loading && (
        <p className="text-xs text-muted-foreground">
          {filteredMembers.length} {status} member{filteredMembers.length === 1 ? "" : "s"}
          {status === "active" && pendingInvites.length > 0 ? ` · ${pendingInvites.length} pending` : ""}
        </p>
      )}

      {loading && <MembersSkeleton />}

      {!loading && filteredMembers.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {status} members{search ? " match your search" : ""}.
        </p>
      )}

      {!loading && filteredMembers.length > 0 && (
        <ListCard fill>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left">
                  <SortHeader col="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortHeader col="role" label="Role" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </th>
                <th className="hidden px-4 py-2.5 text-left lg:table-cell">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Email</span>
                </th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Mobile</span>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => {
                const isMe = m.user_id === currentUserId
                const isOwner = m.role === "owner"
                return (
                  <tr key={m.id} className="group border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      {getMemberDisplayName(m)}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      {(isOwner || m.is_admin) && (
                        <span className="ml-2 inline-block rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs text-brand">
                          {isOwner ? "Owner" : "Admin"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{roleLabelOf(m.role)}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{emails[m.user_id] ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{m.user_profiles?.mobile ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {status === "active" && callerIsOwner && !isOwner && (
                          <button
                            type="button"
                            className="px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => handleToggleAdmin(m)}
                            title={m.is_admin ? "Revoke admin" : "Grant admin"}
                          >
                            {m.is_admin ? "Admin ✓" : "Admin"}
                          </button>
                        )}
                        {status === "active" && <EditButton label="Edit member" onClick={() => setEditing(m)} />}
                        {status === "active" && callerIsOwner && !isMe && !isOwner && (
                          <DeleteButton
                            icon={Archive}
                            label="Archive member"
                            title={`Archive ${getMemberDisplayName(m)}?`}
                            itemName="this member"
                            description="They lose workspace access (history is kept — you can reactivate later). If they manage work, you'll reassign it first."
                            confirmLabel="Archive"
                            onConfirm={() => startArchive(m)}
                          />
                        )}
                        {status === "inactive" && callerIsOwner && (
                          <button
                            type="button"
                            disabled={reactivatingId === m.id}
                            onClick={() => handleReactivate(m.id)}
                            className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                          >
                            <RotateCcw className="size-3.5" /> {reactivatingId === m.id ? "Reactivating…" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ListCard>
      )}

      {editingMember && orgId && (
        <EditMemberModal
          key={editingMember.id}
          member={editingMember}
          orgId={orgId}
          assignable={assignableRoles}
          labelOf={roleLabelOf}
          isMe={editingMember.user_id === currentUserId}
          isOwner={editingMember.role === "owner"}
          showEmergency={showEmergency}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {archivingMember && (
        <ReassignBeforeArchiveModal
          open
          memberName={getMemberDisplayName(archivingMember)}
          fromUserId={archivingMember.user_id}
          workload={archiveWorkload}
          onCancel={() => setArchivingMember(null)}
          onReassigned={() => {
            const id = archivingMember.id
            setArchivingMember(null)
            handleRemove(id)
          }}
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
                    <p className="text-xs text-muted-foreground">{roleLabelOf(inv.role)} · pending</p>
                  </div>
                  <IconButton icon={<Trash2 className="h-3.5 w-3.5" />} label="Revoke invite" onClick={() => handleRevokeInvite(inv.id)} className="pa-iconbtn--destructive" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {accessStepUpModal}
    </div>
  )
}
