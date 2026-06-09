"use client"

/**
 * components/work/AssigneePicker.tsx — reassign a work item or property (ADDENDUM_TEAMS Layer 0 + 1)
 *
 * Auth:   calls the audited reassign actions (requireAgentWriteAccess server-side).
 * Data:   listOrgAgents + listTeamOptions; reassignWorkItem (work tables) / setPropertyManager (properties).
 * Notes:  "Assign to → Me / an agent / a team / Everyone (org)". Value encodes the target: "user:<id>",
 *         "team:<id>", or "__everyone__" (both null — the shared bucket, D-11/12). Teams only appear on firm
 *         orgs (non-firm has none). Pass `workTable` for a work item; omit it to set a property's manager.
 *         Optimistic with rollback; router.refresh() so the My-work / My-portfolio filters re-resolve.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { SelectField } from "@/components/forms/fields"
import { useUser } from "@/hooks/useUser"
import { listOrgAgents, reassignWorkItem, setPropertyManager, type WorkTable } from "@/lib/work/assignees"
import { listTeamOptions } from "@/lib/work/teams"

const EVERYONE = "__everyone__"

export function AssigneePicker({
  recordId, currentAssigneeId, currentTeamId = null, workTable, label = "Assigned to",
}: Readonly<{
  recordId: string
  currentAssigneeId: string | null
  currentTeamId?: string | null
  /** present → work item (assigned_user_id/team); omitted → property (managing_agent_id/team) */
  workTable?: WorkTable
  label?: string
}>) {
  const router = useRouter()
  const { user } = useUser()
  let initial = EVERYONE
  if (currentTeamId) initial = `team:${currentTeamId}`
  else if (currentAssigneeId) initial = `user:${currentAssigneeId}`
  const [value, setValue] = useState(initial)
  const { data: agents = [] } = useQuery({ queryKey: ["org-agents"], queryFn: listOrgAgents, staleTime: 5 * 60 * 1000 })
  const { data: teams = [] } = useQuery({ queryKey: ["team-options"], queryFn: listTeamOptions, staleTime: 5 * 60 * 1000 })

  async function onChange(next: string) {
    const prev = value
    setValue(next)
    let assignedUserId: string | null = null
    let assignedTeamId: string | null = null
    if (next.startsWith("user:")) assignedUserId = next.slice(5)
    else if (next.startsWith("team:")) assignedTeamId = next.slice(5)
    const res = workTable
      ? await reassignWorkItem(workTable, recordId, assignedUserId, assignedTeamId)
      : await setPropertyManager(recordId, assignedUserId, assignedTeamId)
    if ("error" in res) {
      setValue(prev)
      toast.error(res.error || "Could not update assignment")
    } else {
      toast.success("Assignment updated")
      router.refresh()
    }
  }

  const meId = user?.id
  const options = [
    { value: EVERYONE, label: "Everyone (org)" },
    ...(meId ? [{ value: `user:${meId}`, label: "Me" }] : []),
    ...agents.filter((a) => a.userId !== meId).map((a) => ({ value: `user:${a.userId}`, label: a.name })),
    ...teams.map((t) => ({ value: `team:${t.id}`, label: `${t.name} (team)` })),
  ]

  return <SelectField label={label} value={value} onChange={onChange} options={options} />
}
