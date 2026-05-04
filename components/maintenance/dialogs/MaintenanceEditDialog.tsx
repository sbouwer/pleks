"use client"

/**
 * components/maintenance/dialogs/MaintenanceEditDialog.tsx — centered dialog to edit a maintenance request's fields
 *
 * Data:   current field values passed as props; calls updateMaintenanceRequest on save
 * Notes:  Triggered from DetailsCard. Refreshes page via router.refresh() on success.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateMaintenanceRequest } from "@/lib/actions/maintenance"

interface CurrentFields {
  title: string
  description: string
  category_override: string | null
  urgency_override: string | null
  access_instructions: string | null
  special_instructions: string | null
  contact_name: string | null
  contact_phone: string | null
  estimated_cost_cents: number | null
  scheduled_date: string | null
  scheduled_time_from: string | null
  scheduled_time_to: string | null
}

interface Props {
  requestId: string
  current: CurrentFields
}

const CATEGORIES = [
  "Plumbing", "Electrical", "Structural", "Roofing", "Appliances",
  "HVAC", "Pest control", "Cleaning", "Painting", "Garden",
  "Security", "Locks & keys", "Flooring", "Windows & doors", "Other",
]

const URGENCIES = [
  { value: "emergency", label: "Emergency" },
  { value: "urgent",    label: "Urgent" },
  { value: "routine",   label: "Routine" },
  { value: "cosmetic",  label: "Cosmetic" },
]

export function MaintenanceEditDialog({ requestId, current }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [title, setTitle]                           = useState(current.title)
  const [description, setDescription]               = useState(current.description)
  const [categoryOverride, setCategoryOverride]     = useState(current.category_override ?? "")
  const [urgencyOverride, setUrgencyOverride]       = useState(current.urgency_override ?? "")
  const [accessInstructions, setAccessInstructions] = useState(current.access_instructions ?? "")
  const [specialInstructions, setSpecialInstructions] = useState(current.special_instructions ?? "")
  const [contactName, setContactName]               = useState(current.contact_name ?? "")
  const [contactPhone, setContactPhone]             = useState(current.contact_phone ?? "")
  const [estimatedCost, setEstimatedCost]           = useState(
    current.estimated_cost_cents != null ? String(current.estimated_cost_cents / 100) : ""
  )
  const [scheduledDate, setScheduledDate]   = useState(current.scheduled_date ?? "")
  const [scheduledFrom, setScheduledFrom]   = useState(current.scheduled_time_from ?? "")
  const [scheduledTo, setScheduledTo]       = useState(current.scheduled_time_to ?? "")

  function handleSave() {
    if (!title.trim()) { toast.error("Title is required"); return }

    const costCents = estimatedCost.trim()
      ? Math.round(parseFloat(estimatedCost) * 100)
      : null
    if (estimatedCost.trim() && isNaN(costCents!)) {
      toast.error("Invalid cost amount"); return
    }

    startTransition(async () => {
      const result = await updateMaintenanceRequest(requestId, {
        title:                title.trim(),
        description:          description.trim() || undefined,
        category_override:    categoryOverride.trim() || null,
        urgency_override:     urgencyOverride || null,
        access_instructions:  accessInstructions.trim() || null,
        special_instructions: specialInstructions.trim() || null,
        contact_name:         contactName.trim() || null,
        contact_phone:        contactPhone.trim() || null,
        estimated_cost_cents: costCents,
        scheduled_date:       scheduledDate || null,
        scheduled_time_from:  scheduledFrom || null,
        scheduled_time_to:    scheduledTo || null,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Request updated")
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" />}>
        <Pencil className="h-3 w-3" />
        Edit
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mr-title">Title</Label>
            <Input id="mr-title" value={title} onChange={e => setTitle(e.target.value)} disabled={pending} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mr-description">Description</Label>
            <Textarea id="mr-description" rows={4} value={description} onChange={e => setDescription(e.target.value)} disabled={pending} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category override</Label>
              <Select value={categoryOverride} onValueChange={val => setCategoryOverride(val ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="— keep original —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— keep original —</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgency override</Label>
              <Select value={urgencyOverride} onValueChange={val => setUrgencyOverride(val ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="— keep original —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— keep original —</SelectItem>
                  {URGENCIES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Access</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mr-contact-name">Contact name</Label>
                <Input id="mr-contact-name" value={contactName} onChange={e => setContactName(e.target.value)} disabled={pending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-contact-phone">Contact phone</Label>
                <Input id="mr-contact-phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} disabled={pending} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-access">Access instructions</Label>
              <Textarea id="mr-access" rows={2} value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-special">Special instructions</Label>
              <Textarea id="mr-special" rows={2} value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} disabled={pending} />
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scheduling & Cost</p>
            <div className="space-y-1.5">
              <Label htmlFor="mr-cost">Estimated cost (ZAR)</Label>
              <Input id="mr-cost" type="number" min="0" step="0.01" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="0.00" disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-date">Scheduled date</Label>
              <Input id="mr-date" type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} disabled={pending} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mr-from">From</Label>
                <Input id="mr-from" type="time" value={scheduledFrom} onChange={e => setScheduledFrom(e.target.value)} disabled={pending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-to">To</Label>
                <Input id="mr-to" type="time" value={scheduledTo} onChange={e => setScheduledTo(e.target.value)} disabled={pending} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || !title.trim()}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
