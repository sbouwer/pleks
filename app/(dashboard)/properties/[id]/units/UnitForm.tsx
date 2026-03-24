"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UNIT_FEATURES } from "@/lib/constants"
import { useState } from "react"

interface UnitFormProps {
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
  readonly defaultValues?: {
    unit_number?: string
    floor?: number
    size_m2?: number
    bedrooms?: number
    bathrooms?: number
    parking_bays?: number
    furnished?: boolean
    features?: string[]
    asking_rent?: number
    notes?: string
  }
}

export function UnitForm({ action, defaultValues }: UnitFormProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(defaultValues?.features || [])

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Append features since checkboxes might not all be in formData
      selectedFeatures.forEach((f) => formData.append("features", f))
      const result = await action(formData)
      return result || null
    },
    null
  )

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    )
  }

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="space-y-2">
        <Label htmlFor="unit_number">Unit Name / Number *</Label>
        <Input id="unit_number" name="unit_number" defaultValue={defaultValues?.unit_number} placeholder='e.g. "Flat 1", "House", "Unit 2A"' required />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input id="bedrooms" name="bedrooms" type="number" min="0" defaultValue={defaultValues?.bedrooms ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Input id="bathrooms" name="bathrooms" type="number" min="0" step="0.5" defaultValue={defaultValues?.bathrooms ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="parking_bays">Parking</Label>
          <Input id="parking_bays" name="parking_bays" type="number" min="0" defaultValue={defaultValues?.parking_bays ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="size_m2">Size (m²)</Label>
          <Input id="size_m2" name="size_m2" type="number" min="0" step="0.01" defaultValue={defaultValues?.size_m2 ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="floor">Floor</Label>
        <Input id="floor" name="floor" type="number" defaultValue={defaultValues?.floor ?? ""} placeholder="For apartment blocks" />
      </div>

      <div className="space-y-2">
        <Label>Features</Label>
        <div className="flex flex-wrap gap-2">
          {UNIT_FEATURES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFeature(f)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                selectedFeatures.includes(f)
                  ? "bg-brand text-brand-dim border-brand"
                  : "border-border text-muted-foreground hover:border-brand/50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="asking_rent">Asking Rent (ZAR)</Label>
        <Input id="asking_rent" name="asking_rent" type="number" min="0" step="0.01" defaultValue={defaultValues?.asking_rent ?? ""} placeholder="e.g. 8500" />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="furnished" name="furnished" value="true" defaultChecked={defaultValues?.furnished} />
        <Label htmlFor="furnished">Furnished</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Internal Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes} rows={3} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Save Unit"}
      </Button>
    </form>
  )
}
