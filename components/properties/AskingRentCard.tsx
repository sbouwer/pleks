"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { updateAskingRent } from "@/lib/actions/units"
import { formatZAR } from "@/lib/constants"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Props {
  unitId: string
  currentRentCents: number | null
}

export function AskingRentCard({ unitId, currentRentCents }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rent, setRent] = useState(
    currentRentCents ? (currentRentCents / 100).toFixed(2) : ""
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const cents = Math.round(Number.parseFloat(rent) * 100)
    if (!cents || cents <= 0) { toast.error("Enter a valid amount"); return }
    setSaving(true)
    const result = await updateAskingRent(unitId, cents)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Asking rent updated")
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-elevated px-4 py-3 hover:border-brand/40 transition-colors text-left w-full"
      >
        <div className="shrink-0 size-7 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-purple-500">
          P
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-tight">Set asking rent</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
            {currentRentCents ? `Currently ${formatZAR(currentRentCents)}` : "Not set"}
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set asking rent</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {currentRentCents && (
              <p className="text-sm text-muted-foreground">
                Current: {formatZAR(currentRentCents)}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="asking-rent-input">New asking rent (ZAR) *</Label>
              <Input
                id="asking-rent-input"
                type="number"
                min="0"
                step="0.01"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                placeholder="e.g. 8500"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !rent}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
