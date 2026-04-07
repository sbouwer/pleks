"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { UNIT_FEATURES } from "@/lib/constants"
import { getVisibleFields } from "@/lib/units/typeAwareFields"
import { createUnitData } from "@/lib/actions/units"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AddUnitDialogProps {
  readonly propertyId: string
  readonly propertyType: string
  readonly trigger: React.ReactNode
  readonly onSuccess?: () => void
}

export function AddUnitDialog({ propertyId, propertyType, trigger, onSuccess }: AddUnitDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [furnished, setFurnished] = useState(false)
  const [isPending, startTransition] = useTransition()

  const fields = getVisibleFields(propertyType as "residential" | "commercial" | "mixed")
  const titleType = propertyType.charAt(0).toUpperCase() + propertyType.slice(1)

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    )
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)

    // Add features manually since they're managed in state
    selectedFeatures.forEach((f) => formData.append("features", f))
    formData.set("furnished", String(furnished))

    startTransition(async () => {
      const result = await createUnitData(propertyId, formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Unit added")
        setOpen(false)
        setSelectedFeatures([])
        setFurnished(false)
        form.reset()
        onSuccess?.()
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as React.ReactElement} />
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add {titleType} unit</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4">
          {/* Unit number */}
          <div className="space-y-1.5">
            <Label htmlFor="unit_number">Unit number *</Label>
            <Input id="unit_number" name="unit_number" required placeholder="e.g. 101" />
          </div>

          {/* Size m² — prominent for commercial */}
          <div className="space-y-1.5">
            <Label htmlFor="size_m2">{fields.sizePrimary ? "Size m² *" : "Size m²"}</Label>
            <Input
              id="size_m2"
              name="size_m2"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 75"
            />
          </div>

          {/* Bedrooms (residential) */}
          {fields.bedrooms && (
            <div className="space-y-1.5">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input id="bedrooms" name="bedrooms" type="number" min="0" placeholder="e.g. 2" />
            </div>
          )}

          {/* Bathrooms (residential) */}
          {fields.bathrooms && (
            <div className="space-y-1.5">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input id="bathrooms" name="bathrooms" type="number" min="0" step="0.5" placeholder="e.g. 1" />
            </div>
          )}

          {/* Floor */}
          <div className="space-y-1.5">
            <Label htmlFor="floor">Floor (0 = ground)</Label>
            <Input id="floor" name="floor" type="number" min="0" placeholder="e.g. 0" />
          </div>

          {/* Parking bays */}
          <div className="space-y-1.5">
            <Label htmlFor="parking_bays">Parking bays</Label>
            <Input id="parking_bays" name="parking_bays" type="number" min="0" placeholder="e.g. 1" />
          </div>

          {/* Furnished toggle (residential) */}
          {fields.furnished && (
            <div className="space-y-1.5">
              <Label>Furnished</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFurnished(true)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    furnished
                      ? "bg-brand/15 text-brand border-brand/30"
                      : "bg-muted/50 text-muted-foreground border-border/60"
                  )}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setFurnished(false)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    furnished
                      ? "bg-muted/50 text-muted-foreground border-border/60"
                      : "bg-brand/15 text-brand border-brand/30"
                  )}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Asking rent */}
          <div className="space-y-1.5">
            <Label htmlFor="asking_rent">Asking rent (R)</Label>
            <Input id="asking_rent" name="asking_rent" type="number" min="0" step="0.01" placeholder="e.g. 8500" />
          </div>

          {/* Deposit */}
          <div className="space-y-1.5">
            <Label htmlFor="deposit_amount">Deposit (R)</Label>
            <Input id="deposit_amount" name="deposit_amount" type="number" min="0" step="0.01" placeholder="e.g. 17000" />
          </div>

          {/* Features */}
          <div className="space-y-2">
            <Label>Features</Label>
            <div className="flex flex-wrap gap-1.5">
              {UNIT_FEATURES.map((feature) => {
                const active = selectedFeatures.includes(feature)
                return (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      active
                        ? "bg-brand/15 text-brand border-brand/30"
                        : "bg-muted/50 text-muted-foreground border-border/60 hover:border-border"
                    )}
                  >
                    {feature}
                  </button>
                )
              })}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Adding..." : "Add unit"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
