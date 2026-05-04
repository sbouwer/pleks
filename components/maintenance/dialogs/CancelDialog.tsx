"use client"

/**
 * components/maintenance/dialogs/CancelDialog.tsx — structured cancellation dialog for maintenance requests
 *
 * Data:   calls cancelMaintenanceRequest on confirm; caller passes requestId
 * Notes:  Requires a category + free-text reason. Triggers WO token revocation if applicable.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/dialog"
import { cancelMaintenanceRequest } from "@/lib/actions/maintenance"

const CATEGORIES: { value: string; label: string }[] = [
  { value: "tenant_withdrew",          label: "Tenant withdrew request" },
  { value: "duplicate_request",        label: "Duplicate request" },
  { value: "no_longer_required",       label: "No longer required" },
  { value: "contractor_unavailable",   label: "Contractor unavailable" },
  { value: "agent_decision",           label: "Agent decision" },
  { value: "work_completed_externally",label: "Work completed externally" },
  { value: "wrong_property",           label: "Wrong property" },
  { value: "other",                    label: "Other" },
]

interface Props {
  requestId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CancelDialog({ requestId, open, onOpenChange }: Readonly<Props>) {
  const router = useRouter()
  const [category, setCategory] = useState("")
  const [reason, setReason]     = useState("")
  const [pending, startTransition] = useTransition()

  function handleCancel() {
    if (!category) { toast.error("Please select a cancellation category"); return }
    if (!reason.trim()) { toast.error("Please provide a reason"); return }

    startTransition(async () => {
      const result = await cancelMaintenanceRequest(requestId, reason.trim(), category)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Request cancelled")
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
            <DialogTitle>Cancel request</DialogTitle>
          </div>
          <DialogDescription>
            This will permanently cancel the request. If a work order has been sent, the contractor portal link will be revoked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Cancellation category</Label>
            <Select value={category} onValueChange={val => setCategory(val ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Details</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Brief explanation…"
              disabled={pending}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleCancel} disabled={pending} className="flex-1">
              {pending ? "Cancelling…" : "Cancel request"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Keep open
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
