"use client"

/**
 * components/maintenance/dialogs/ChangeContractorDialog.tsx — reassign contractor on an active work order
 *
 * Data:   contractor list passed as prop from server page; calls changeContractor action on save
 * Notes:  If WO has been sent, revokes old token and emails both old and new contractors.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck } from "lucide-react"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { changeContractor } from "@/lib/actions/maintenance"

interface Contractor {
  id: string
  name: string
}

interface Props {
  requestId: string
  currentContractorId: string | null
  contractors: Contractor[]
}

export function ChangeContractorDialog({ requestId, currentContractorId, contractors }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [newContractorId, setNewContractorId] = useState("")
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const available = contractors.filter(c => c.id !== currentContractorId)

  function handleSave() {
    if (!newContractorId) { toast.error("Select a contractor"); return }
    if (!reason.trim()) { toast.error("Please provide a reason for reassignment"); return }

    startTransition(async () => {
      const result = await changeContractor(requestId, newContractorId, reason.trim())
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Contractor reassigned")
        setOpen(false)
        setNewContractorId("")
        setReason("")
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<ActionButton tone="secondary" />}>
        <UserCheck className="h-3 w-3" />
        Change
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-5 w-5 text-brand shrink-0" />
            <DialogTitle>Change contractor</DialogTitle>
          </div>
          <DialogDescription>
            If a work order has already been sent, the old contractor&apos;s portal link will be revoked and a new one emailed to the replacement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>New contractor</Label>
            <Select value={newContractorId} onValueChange={val => setNewContractorId(val ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Select contractor…" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <SelectItem value="none" disabled>No other contractors available</SelectItem>
                ) : (
                  available.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason">Reason for change</Label>
            <Textarea
              id="reassign-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Contractor declined the job…"
              disabled={pending}
            />
          </div>

          <div className="flex gap-2">
            <ActionButton tone="primary" className="flex-1" disabled={pending || available.length === 0} onClick={handleSave}>
              {pending ? "Reassigning…" : "Reassign contractor"}
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
