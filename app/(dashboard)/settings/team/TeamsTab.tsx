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
import { Users, X, Archive } from "lucide-react"
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const selected = teams.find((t) => t.id === selectedId) ?? null

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
      <p className="text-sm text-muted-foreground">
        Group members into teams — work can be assigned to a team, and every member sees it until someone picks it up.
      </p>

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
                      onClick={() => setSelectedId(t.id)}
                      className="group cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{FN_LABEL[t.function] ?? t.function}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.members.length}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <EditButton label="Edit team" onClick={() => setSelectedId(t.id)} />
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
      {selected && <TeamDetailModal team={selected} agents={agents} busy={busy} run={run} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function TeamDetailModal({
  team, agents, busy, run, onClose,
}: Readonly<{
  team: TeamWithMembers
  agents: { userId: string; name: string }[]
  busy: boolean
  run: (p: Promise<{ ok: true } | { error: string }>, ok?: string) => Promise<boolean>
  onClose: () => void
}>) {
  const [editName, setEditName] = useState(team.name)
  const [editFn, setEditFn] = useState<TeamFunction>(team.function)
  const dirty = editName.trim() !== team.name || editFn !== team.function
  const memberIds = new Set(team.members.map((m) => m.userId))
  const addable = agents.filter((a) => !memberIds.has(a.userId))
  return (
    <Modal open onClose={onClose} title="Edit team" icon={<Users className="size-5" />}
      actions={
        <>
          <ActionButton onClick={onClose}>Done</ActionButton>
          <ActionButton tone="primary" disabled={busy || !dirty || !editName.trim()}
            onClick={() => run(updateTeam(team.id, { name: editName.trim(), function: editFn }), "Team updated")}>
            Save
          </ActionButton>
        </>
      }>
      <div className="space-y-4">
        <TextField label="Team name" value={editName} onChange={setEditName} />
        <SelectField label="Function" value={editFn} onChange={(v) => setEditFn(v as TeamFunction)} options={FUNCTION_OPTIONS} />

        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Members</p>

        <div className="flex flex-wrap items-center gap-2">
          {team.members.map((m) => (
            <span key={m.userId} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
              {m.name}
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                disabled={busy}
                onClick={() => run(removeTeamMember(team.id, m.userId))}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {team.members.length === 0 && <span className="text-xs text-muted-foreground">No members yet</span>}
        </div>

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
