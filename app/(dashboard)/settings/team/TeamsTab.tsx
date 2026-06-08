"use client"

/**
 * app/(dashboard)/settings/team/TeamsTab.tsx — named-team management (ADDENDUM_TEAMS Layer 1, firm-tier)
 *
 * Route:  /settings/team?tab=teams (firm-gated — the page only renders this tab on firm tier)
 * Data:   listTeams + listOrgAgents; createTeam / archiveTeam / add+removeTeamMember (audited actions)
 * Notes:  Create a team (name + function), add/remove members, archive. Archiving clears the team off its
 *         items/properties (→ Everyone/Org). The virtual Everyone/Org "team" is never listed here (D-11).
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users, X } from "lucide-react"
import { ActionButton, Modal } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { TextField, SelectField } from "@/components/forms/fields"
import { listTeams, createTeam, archiveTeam, addTeamMember, removeTeamMember, type TeamFunction } from "@/lib/work/teams"
import { listOrgAgents } from "@/lib/work/assignees"

const FUNCTION_OPTIONS: { value: TeamFunction; label: string }[] = [
  { value: "general", label: "General" },
  { value: "maintenance", label: "Maintenance" },
  { value: "rentals", label: "Rentals" },
  { value: "billing", label: "Billing" },
  { value: "inspections", label: "Inspections" },
]
const FN_LABEL = Object.fromEntries(FUNCTION_OPTIONS.map((o) => [o.value, o.label]))

export function TeamsTab() {
  const qc = useQueryClient()
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams, staleTime: 60_000 })
  const { data: agents = [] } = useQuery({ queryKey: ["org-agents"], queryFn: listOrgAgents, staleTime: 5 * 60_000 })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [fn, setFn] = useState<TeamFunction>("general")
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ["teams"] })

  async function run(p: Promise<{ ok: true } | { error: string }>, ok?: string) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Group members into teams. Work can be assigned to a team — every member sees it until someone picks it up.
        </p>
        {!creating && <AddButton label="New team" onClick={() => setCreating(true)} />}
      </div>

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

      {teams.length === 0 && (
        <EmptyResourceState
          emptyTitle="No teams yet"
          emptySub="Create a team to group members and route work to the whole team at once."
          icon={<Users className="h-6 w-6" />}
          heroAction={<AddButton label="New team" showPlus={false} onClick={() => setCreating(true)} />}
        />
      )}

      {teams.map((team) => {
        const memberIds = new Set(team.members.map((m) => m.userId))
        const addable = agents.filter((a) => !memberIds.has(a.userId))
        return (
          <div key={team.id} className="space-y-3 rounded-[var(--r-button)] border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{team.name}</p>
                <p className="text-xs text-muted-foreground">{FN_LABEL[team.function] ?? team.function} · {team.members.length} member{team.members.length === 1 ? "" : "s"}</p>
              </div>
              <ActionButton size="sm" tone="secondary" disabled={busy} onClick={() => run(archiveTeam(team.id), "Team archived")}>
                Archive
              </ActionButton>
            </div>

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
              <div className="max-w-xs">
                <SelectField
                  label=""
                  value=""
                  onChange={(userId) => { if (userId) void run(addTeamMember(team.id, userId)) }}
                  options={[{ value: "", label: "Add member…" }, ...addable.map((a) => ({ value: a.userId, label: a.name }))]}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
