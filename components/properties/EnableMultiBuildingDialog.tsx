"use client"

/**
 * components/properties/EnableMultiBuildingDialog.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { enableMultiBuilding } from "@/lib/actions/buildings"

interface EnableMultiBuildingDialogProps {
  readonly propertyId: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSuccess: () => void
}

export function EnableMultiBuildingDialog({
  propertyId,
  open,
  onOpenChange,
  onSuccess,
}: EnableMultiBuildingDialogProps) {
  const [name, setName] = useState("Main building")
  const [isPending, startTransition] = useTransition()

  function handleEnable() {
    startTransition(async () => {
      const result = await enableMultiBuilding(propertyId, name)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Multi-building mode enabled")
        onSuccess()
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable multiple buildings?</DialogTitle>
          <DialogDescription>
            Use this when your property has more than one building on the same erf — for example a
            main house and cottage, an office park with multiple blocks, or a sectional title scheme
            with separate buildings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label htmlFor="primary-building-name">Name for the primary building</Label>
          <Input
            id="primary-building-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main building"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleEnable} disabled={isPending}>
            {isPending ? "Enabling…" : "Enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
