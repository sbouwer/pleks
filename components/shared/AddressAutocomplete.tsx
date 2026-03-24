"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Address input with manual fields.
 * Google Places Autocomplete requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
 * Falls back to manual entry when API key is not configured.
 *
 * TODO: Add Google Places Autocomplete when API key is available.
 * Restrict to South Africa: componentRestrictions: { country: 'za' }
 */
interface AddressFields {
  address_line1?: string
  suburb?: string
  city?: string
  province?: string
  postal_code?: string
}

export function AddressAutocomplete({ defaults }: Readonly<{ defaults?: AddressFields }>) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter the property address manually. Google Places autocomplete coming soon.
      </p>
      <div className="space-y-2">
        <Label htmlFor="address_line1">Street Address *</Label>
        <Input id="address_line1" name="address_line1" defaultValue={defaults?.address_line1} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="suburb">Suburb</Label>
          <Input id="suburb" name="suburb" defaultValue={defaults?.suburb} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input id="city" name="city" defaultValue={defaults?.city} required />
        </div>
      </div>
    </div>
  )
}
