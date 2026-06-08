"use client"

/**
 * components/work/AssigneePicker.tsx — reassign a work item or property (ADDENDUM_TEAMS Layer 0)
 *
 * Auth:   calls the audited reassign actions (requireAgentWriteAccess server-side).
 * Data:   listOrgAgents (org members); reassignWorkItem (work tables) / setPropertyManager (properties).
 * Notes:  "Assign to → Me / an agent / Everyone (org)". Everyone = NULL assignee (the shared bucket,
 *         D-11/12). Pass `workTable` for a work item; omit it to set a property's manager. Optimistic value
 *         with rollback on error; router.refresh() so the My-work / My-portfolio filters re-resolve.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { SelectField } from "@/components/forms/fields"
import { useUser } from "@/hooks/useUser"
import { listOrgAgents, reassignWorkItem, setPropertyManager, type WorkTable } from "@/lib/work/assignees"

const EVERYONE = "__everyone__"

export function AssigneePicker({
  recordId, currentAssigneeId, workTable, label = "Assigned to",
}: Readonly<{
  recordId: string
  currentAssigneeId: string | null
  /** present → work item (assigned_user_id); omitted → property (managing_agent_id) */
  workTable?: WorkTable
  label?: string
}>) {
  const router = useRouter()
  const { user } = useUser()
  const [value, setValue] = useState(currentAssigneeId ?? EVERYONE)
  const { data: agents = [] } = useQuery({ queryKey: ["org-agents"], queryFn: listOrgAgents, staleTime: 5 * 60 * 1000 })

  async function onChange(next: string) {
    const prev = value
    setValue(next)
    const assignedUserId = next === EVERYONE ? null : next
    const res = workTable
      ? await reassignWorkItem(workTable, recordId, assignedUserId)
      : await setPropertyManager(recordId, assignedUserId)
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
    ...(meId ? [{ value: meId, label: "Me" }] : []),
    ...agents.filter((a) => a.userId !== meId).map((a) => ({ value: a.userId, label: a.name })),
  ]

  return <SelectField label={label} value={value} onChange={onChange} options={options} />
}
