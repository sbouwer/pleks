"use client"

/**
 * app/(dashboard)/settings/team/TeamsTab.tsx — named-team management (ADDENDUM_TEAMS Layer 1, firm-tier)
 *
 * Route:  /settings/team?tab=teams (firm-gated — the page only renders this tab on firm tier)
 * Data:   listTeams + listOrgAgents; createTeam / archiveTeam / add+removeTeamMember (audited actions)
 * Notes:  Suppliers-style list (search + function filter + sortable columns); row hover → Edit (members
 *         modal) + Archive. Archive is blocked while the team has members (prompt to remove/reassign first).
 *         "New team" lives in the page header (NewTeamButton dispatches `pleks:new-team`). The virtual
 *         Everyone/Org "team" is never listed (D-11).
 */
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users, User, Archive, Phone, Mail } from "lucide-react"
import { ActionButton, Modal, EditButton, DeleteButton } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { TextField, SelectField } from "@/components/forms/fields"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { listTeams, createTeam, updateTeam, archiveTeam, addTeamMember, removeTeamMember, type TeamFunction, type TeamWithMembers } from "@/lib/work/teams"
import { listOrgAgents } from "@/lib/work/assignees"

const FUNCTION_OPTIONS: { value: TeamFunction; label: string }[] = [
  { value: "general", label: "General" },
  { value: "maintenance", label: "Maintenance" },
  { value: "rentals", label: "Rentals" },
  { value: "billing", label: "Billing" },
  { value: "inspections", label: "Inspections" },
]
const FN_LABEL = Object.fromEntries(FUNCTION_OPTIONS.map((o) => [o.value, o.label]))

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", property_manager: "Property Manager", agent: "Agent",
  accountant: "Accountant", maintenance_manager: "Maintenance Manager",
}

type SortKey = "name" | "function" | "members"

/** Header action — dispatches the event TeamsTab listens for (it lives outside this component). */
export function NewTeamButton() {
  return <AddButton label="New team" onClick={() => globalThis.dispatchEvent(new CustomEvent("pleks:new-team"))} />
}

export function TeamsTab() {
  const qc = useQueryClient()
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams, staleTime: 60_000 })
  const { data: agents = [] } = useQuery({ queryKey: ["org-agents"], queryFn: listOrgAgents, staleTime: 5 * 60_000 })

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [fn, setFn] = useState<TeamFunction>("general")
  const [busy, setBusy] = useState(false)
  const [membersId, setMembersId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [fnFilter, setFnFilter] = useState("")
  const { sortKey, sortDir, onSort } = useListSort<SortKey>("name")

  // The "New team" button lives in the page header — open the create modal on its event.
  useEffect(() => {
    const open = () => setCreating(true)
    globalThis.addEventListener("pleks:new-team", open)
    return () => globalThis.removeEventListener("pleks:new-team", open)
  }, [])

  const refresh = () => qc.invalidateQueries({ queryKey: ["teams"] })
  const membersTeam = teams.find((t) => t.id === membersId) ?? null
  const editTeam = teams.find((t) => t.id === editId) ?? null

  async function run(p: Promise<{ ok: true } | { error: string }>, ok?: string): Promise<boolean> {
    setBusy(true)
    const res = await p
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return false }
    if (ok) toast.success(ok)
    refresh()
    return true
  }

  async function handleCreate() {
    setBusy(true)
    const res = await createTeam(name, fn)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success("Team created"); setName(""); setFn("general"); setCreating(false); refresh()
  }

  // DeleteButton confirm — a team with members can't be archived; the {blocked} return morphs the dialog
  // into an acknowledge view (server-side guard in archiveTeam).
  async function handleArchive(team: TeamWithMembers): Promise<void | { blocked: string }> {
    const res = await archiveTeam(team.id)
    if ("error" in res) {
      if (res.error.toLowerCase().includes("member")) return { blocked: res.error }
      toast.error(res.error)
      return
    }
    toast.success("Team archived")
    refresh()
  }

  const q = search.trim().toLowerCase()
  const filtered = teams
    .filter((t) => (!q || t.name.toLowerCase().includes(q)) && (!fnFilter || t.function === fnFilter))
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") cmp = a.name.localeCompare(b.name)
      else if (sortKey === "function") cmp = (FN_LABEL[a.function] ?? a.function).localeCompare(FN_LABEL[b.function] ?? b.function)
      else cmp = a.members.length - b.members.length
      return sortDir === "asc" ? cmp : -cmp
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {teams.length === 0 ? (
        <EmptyResourceState
          emptyTitle="No teams yet"
          emptySub="Create a team to group members and route work to the whole team at once."
          icon={<Users className="h-6 w-6" />}
          heroAction={<AddButton label="New team" showPlus={false} onClick={() => setCreating(true)} />}
        />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search teams…"
            filters={
              <ToolbarFilter
                label="Function"
                selected={fnFilter ? [fnFilter] : []}
                onChange={(next) => setFnFilter(next[0] ?? "")}
                options={FUNCTION_OPTIONS}
              />
            }
          />
          <p className="text-xs text-muted-foreground">{filtered.length} of {teams.length} team{teams.length === 1 ? "" : "s"}</p>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No teams match your search.</p>
          ) : (
            <ListCard fill>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left"><SortHeader col="name" label="Team" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                    <th className="px-4 py-2.5 text-left"><SortHeader col="function" label="Function" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                    <th className="px-4 py-2.5 text-left"><SortHeader col="members" label="Members" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
                    <th className="px-4 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setMembersId(t.id)}
                      className="group cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{FN_LABEL[t.function] ?? t.function}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.members.length}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <EditButton label="Edit team" onClick={() => setEditId(t.id)} />
                          <DeleteButton
                            icon={Archive}
                            label="Archive team"
                            title={`Archive ${t.name}?`}
                            itemName="this team"
                            description="Its assigned work moves to Everyone (org). A team with members can't be archived — remove or reassign them first."
                            confirmLabel="Archive"
                            onConfirm={() => handleArchive(t)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ListCard>
          )}
        </>
      )}

      {/* New team */}
      <Modal
        open={creating}
        onClose={() => { setCreating(false); setName("") }}
        title="New team"
        icon={<Users className="size-5" />}
        actions={
          <>
            <ActionButton onClick={() => { setCreating(false); setName("") }}>Cancel</ActionButton>
            <ActionButton tone="primary" onClick={handleCreate} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create team"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="Team name" value={name} onChange={setName} placeholder="e.g. Maintenance" />
          <SelectField label="Function" value={fn} onChange={(v) => setFn(v as TeamFunction)} options={FUNCTION_OPTIONS} />
        </div>
      </Modal>

      {/* Team detail — edit name/function + members */}
      {membersTeam && <TeamMembersModal team={membersTeam} agents={agents} busy={busy} run={run} onClose={() => setMembersId(null)} />}
      {editTeam && <TeamEditModal team={editTeam} busy={busy} run={run} onClose={() => setEditId(null)} />}
    </div>
  )
}

// Clicking a team → its members (People-modal grammar: icon + name + role, call, remove). Edit is separate.
function TeamMembersModal({
  team, agents, busy, run, onClose,
}: Readonly<{
  team: TeamWithMembers
  agents: { userId: string; name: string }[]
  busy: boolean
  run: (p: Promise<{ ok: true } | { error: string }>, ok?: string) => Promise<boolean>
  onClose: () => void
}>) {
  const memberIds = new Set(team.members.map((m) => m.userId))
  const addable = agents.filter((a) => !memberIds.has(a.userId))
  return (
    <Modal open onClose={onClose} title={team.name} icon={<Users className="size-5" />}
      actions={<ActionButton tone="primary" onClick={onClose}>Done</ActionButton>}>
      <div className="space-y-4">
        {team.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {team.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 py-2.5">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--r-button)] bg-muted">
                  <User className="h-[18px] w-[18px] text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {m.phone && (
                    <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`}
                      className="grid h-8 w-8 place-items-center rounded-[var(--r-button)] border border-border text-brand transition-colors hover:bg-muted">
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} aria-label={`Email ${m.name}`}
                      className="grid h-8 w-8 place-items-center rounded-[var(--r-button)] border border-border text-muted-foreground transition-colors hover:bg-muted">
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <DeleteButton
                    label={`Remove ${m.name}`}
                    itemName={m.name}
                    description="They'll be removed from this team (their account isn't affected)."
                    confirmLabel="Remove"
                    loading={busy}
                    onConfirm={async () => { await run(removeTeamMember(team.id, m.userId)) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {addable.length > 0 && (
          <SelectField
            label="Add member"
            value=""
            onChange={(userId) => { if (userId) void run(addTeamMember(team.id, userId)) }}
            options={[{ value: "", label: "Add member…" }, ...addable.map((a) => ({ value: a.userId, label: a.name }))]}
          />
        )}
      </div>
    </Modal>
  )
}

// Edit (hover) → rename + change function.
function TeamEditModal({
  team, busy, run, onClose,
}: Readonly<{
  team: TeamWithMembers
  busy: boolean
  run: (p: Promise<{ ok: true } | { error: string }>, ok?: string) => Promise<boolean>
  onClose: () => void
}>) {
  const [editName, setEditName] = useState(team.name)
  const [editFn, setEditFn] = useState<TeamFunction>(team.function)
  const dirty = editName.trim() !== team.name || editFn !== team.function
  return (
    <Modal open onClose={onClose} title="Edit team" icon={<Users className="size-5" />}
      actions={
        <>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton tone="primary" disabled={busy || !dirty || !editName.trim()}
            onClick={async () => { if (await run(updateTeam(team.id, { name: editName.trim(), function: editFn }), "Team updated")) onClose() }}>
            Save
          </ActionButton>
        </>
      }>
      <div className="space-y-4">
        <TextField label="Team name" value={editName} onChange={setEditName} />
        <SelectField label="Function" value={editFn} onChange={(v) => setEditFn(v as TeamFunction)} options={FUNCTION_OPTIONS} />
      </div>
    </Modal>
  )
}
