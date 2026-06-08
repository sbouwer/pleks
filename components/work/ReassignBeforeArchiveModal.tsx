"use client"

/**
 * components/work/ReassignBeforeArchiveModal.tsx — move an agent's work before archiving (ADDENDUM_TEAMS §1d)
 *
 * Data:   listOrgAgents (targets) + bulkReassignAgent (audited move).
 * Notes:  Archiving a member who owns work must reassign it first (D-13, all tiers). Two flows under one
 *         picker: reassign to another agent, or to Everyone/Org (null → shared pool). On success it calls
 *         onReassigned so the caller proceeds with the archive.
 */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { ActionButton, Modal } from "@/components/ui/actions"
import { SelectField } from "@/components/forms/fields"
import { listOrgAgents } from "@/lib/work/assignees"
import { bulkReassignAgent } from "@/lib/work/reassign"

const EVERYONE = "__everyone__"

export function ReassignBeforeArchiveModal({
  open, memberName, fromUserId, workload, onCancel, onReassigned,
}: Readonly<{
  open: boolean
  memberName: string
  fromUserId: string
  workload: { workItems: number; properties: number }
  onCancel: () => void
  onReassigned: () => void
}>) {
  const [target, setTarget] = useState(EVERYONE)
  const [saving, setSaving] = useState(false)
  const { data: agents = [] } = useQuery({ queryKey: ["org-agents"], queryFn: listOrgAgents, staleTime: 5 * 60 * 1000 })

  async function confirm() {
    setSaving(true)
    const res = await bulkReassignAgent(fromUserId, target === EVERYONE ? null : target)
    setSaving(false)
    if ("error" in res) { toast.error(res.error || "Reassignment failed"); return }
    const { workItems, properties } = res.moved
    toast.success(`Moved ${workItems} item${workItems === 1 ? "" : "s"} and ${properties} propert${properties === 1 ? "y" : "ies"}`)
    onReassigned()
  }

  const options = [
    { value: EVERYONE, label: "Everyone (org)" },
    ...agents.filter((a) => a.userId !== fromUserId).map((a) => ({ value: a.userId, label: a.name })),
  ]

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Reassign before archiving"
      actions={
        <>
          <ActionButton onClick={onCancel}>Cancel</ActionButton>
          <ActionButton tone="primary" onClick={confirm} disabled={saving}>
            {saving ? "Reassigning…" : "Reassign & archive"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {memberName} has {workload.workItems} open work item{workload.workItems === 1 ? "" : "s"} and manages{" "}
          {workload.properties} propert{workload.properties === 1 ? "y" : "ies"}. Move them before archiving so nothing is stranded.
        </p>
        <SelectField label="Reassign to" value={target} onChange={setTarget} options={options} />
        <p className="text-xs text-muted-foreground">
          Everyone (org) puts the work in the shared pool — any agent can pick it up.
        </p>
      </div>
    </Modal>
  )
}
