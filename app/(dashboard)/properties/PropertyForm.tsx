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
import { SA_PROVINCES } from "@/lib/constants"

interface PropertyFormProps {
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
  readonly defaultValues?: {
    name?: string
    type?: string
    address_line1?: string
    address_line2?: string
    suburb?: string
    city?: string
    province?: string
    postal_code?: string
    erf_number?: string
    sectional_title_number?: string
    notes?: string
  }
}

export function PropertyForm({ action, defaultValues }: PropertyFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await action(formData)
      return result || null
    },
    null
  )

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      {state?.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}

      {/* Property details */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Property Details</h2>
        <div className="space-y-2">
          <Label htmlFor="name">Property Name *</Label>
          <Input id="name" name="name" defaultValue={defaultValues?.name} placeholder="e.g. Bouwer Cottage" required />
        </div>
        <div className="space-y-2">
          <Label>Property Type *</Label>
          <Select name="type" defaultValue={defaultValues?.type || "residential"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">Residential</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="mixed">Mixed-use</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Address</h2>
        <div className="space-y-2">
          <Label htmlFor="address_line1">Street Address *</Label>
          <Input id="address_line1" name="address_line1" defaultValue={defaultValues?.address_line1} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_line2">Address Line 2</Label>
          <Input id="address_line2" name="address_line2" defaultValue={defaultValues?.address_line2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="suburb">Suburb</Label>
            <Input id="suburb" name="suburb" defaultValue={defaultValues?.suburb} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input id="city" name="city" defaultValue={defaultValues?.city} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Province *</Label>
            <Select name="province" defaultValue={defaultValues?.province || ""}>
              <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
              <SelectContent>
                {SA_PROVINCES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postal Code</Label>
            <Input id="postal_code" name="postal_code" defaultValue={defaultValues?.postal_code} />
          </div>
        </div>
      </div>

      {/* SA-specific */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">SA Registration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="erf_number">Erf Number</Label>
            <Input id="erf_number" name="erf_number" defaultValue={defaultValues?.erf_number} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sectional_title_number">Sectional Title Number</Label>
            <Input id="sectional_title_number" name="sectional_title_number" defaultValue={defaultValues?.sectional_title_number} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Internal Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes} rows={3} placeholder="Not visible to tenants" />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Save Property"}
      </Button>
    </form>
  )
}
