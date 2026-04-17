"use client"

import { useActionState, useState } from "react"
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
    is_sectional_title?: boolean
    levy_amount_cents?: number | null
    levy_account_number?: string | null
  }
}

const SCHEME_TYPES = [
  { value: "body_corporate", label: "Body corporate" },
  { value: "hoa", label: "HOA" },
  { value: "share_block", label: "Share block" },
  { value: "retirement_village", label: "Retirement village" },
  { value: "other", label: "Other" },
]

function ManagingSchemeSection() {
  const [schemeType, setSchemeType] = useState<string>("none")

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Managing scheme</h2>
      <p className="text-sm text-muted-foreground -mt-2">
        Does this property fall under a body corporate, HOA, or similar scheme?
      </p>
      <input type="hidden" name="scheme_type" value={schemeType} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[{ value: "none", label: "None" }, ...SCHEME_TYPES].map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors
              ${schemeType === opt.value
                ? "border-brand bg-brand/5 font-medium"
                : "border-border hover:border-muted-foreground/40"}`}
          >
            <input
              type="radio"
              name="scheme_type_radio"
              value={opt.value}
              checked={schemeType === opt.value}
              onChange={() => setSchemeType(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
      {schemeType !== "none" && (
        <div className="space-y-2">
          <Label htmlFor="scheme_name">Scheme name</Label>
          <Input
            id="scheme_name"
            name="scheme_name"
            required
            placeholder={schemeType === "body_corporate" ? "e.g. BC Belmont Square" : "e.g. Oakdale HOA"}
          />
        </div>
      )}
    </div>
  )
}

function BodyCorporateSection({ defaultValues }: Readonly<{ defaultValues: PropertyFormProps["defaultValues"] }>) {
  const [isSectional, setIsSectional] = useState(defaultValues?.is_sectional_title ?? false)

  function toggle() { setIsSectional(!isSectional) }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Body corporate</h2>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isSectional}
          onClick={toggle}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isSectional ? "bg-brand" : "bg-muted"}`}
        >
          <span className={`pointer-events-none block size-4 rounded-full bg-white shadow transition-transform ${isSectional ? "translate-x-4" : "translate-x-0"}`} />
        </button>
        <input type="hidden" name="is_sectional_title" value={isSectional ? "true" : "false"} />
        <Label className="cursor-pointer" onClick={toggle}>
          Part of a sectional title scheme
        </Label>
      </div>
      {isSectional && (
        <div className="grid grid-cols-2 gap-4 pl-1">
          <div className="space-y-2">
            <Label htmlFor="levy_amount">Monthly levy (R)</Label>
            <Input
              id="levy_amount"
              name="levy_amount_cents_display"
              type="number"
              step="0.01"
              placeholder="1850.00"
              defaultValue={defaultValues?.levy_amount_cents != null ? defaultValues.levy_amount_cents / 100 : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="levy_account_number">Levy account number</Label>
            <Input
              id="levy_account_number"
              name="levy_account_number"
              placeholder="BC-00412"
              defaultValue={defaultValues?.levy_account_number ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  )
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

      {/* Body corporate */}
      <BodyCorporateSection defaultValues={defaultValues} />

      {/* Managing scheme */}
      <ManagingSchemeSection />

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
