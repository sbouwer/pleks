"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UNIT_FEATURES } from "@/lib/constants"
import { useState } from "react"

interface OrgMember {
  user_id: string
  role: string
  user_profiles: { full_name: string | null } | null
}

interface UnitFormProps {
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
  readonly members: OrgMember[]
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
    deposit_amount?: number
    managed_by?: string
    notes?: string
  }
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  property_manager: "Property Manager",
  agent: "Agent",
  accountant: "Accountant",
  maintenance_manager: "Maintenance Manager",
}

export function UnitForm({ action, members, defaultValues }: UnitFormProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(defaultValues?.features || [])
  const [managedBy, setManagedBy] = useState<string>(defaultValues?.managed_by || "")

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      selectedFeatures.forEach((f) => formData.append("features", f))
      if (managedBy) formData.set("managed_by", managedBy)
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="asking_rent">Asking Rent (ZAR)</Label>
          <Input id="asking_rent" name="asking_rent" type="number" min="0" step="0.01" defaultValue={defaultValues?.asking_rent ?? ""} placeholder="e.g. 8500" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deposit_amount">Deposit (ZAR)</Label>
          <Input id="deposit_amount" name="deposit_amount" type="number" min="0" step="0.01" defaultValue={defaultValues?.deposit_amount ?? ""} placeholder="e.g. 17000" />
        </div>
      </div>

      {members.length > 0 && (
        <div className="space-y-2">
          <Label>Managing Person</Label>
          <Select value={managedBy} onValueChange={(v) => setManagedBy(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Select team member..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {/* If the saved agent is no longer in the members list, show a disabled placeholder */}
              {managedBy && !members.some((m) => m.user_id === managedBy) && (
                <SelectItem value={managedBy} disabled>Unknown agent (removed)</SelectItem>
              )}
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.user_profiles?.full_name || "Unnamed"}{" "}
                  <span className="text-muted-foreground">({ROLE_LABELS[m.role] ?? m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
