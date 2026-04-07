"use client"

import { useActionState, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronDown, ChevronRight } from "lucide-react"
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
import { PropertyEditSidebar } from "./[id]/PropertyEditSidebar"

interface Landlord {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
}

interface UnitSummary {
  id: string
  unit_number: string | null
  status: string
  tenantName: string | null
}

interface TeamMember {
  userId: string
  name: string
  role: string
}

interface PropertyEditFormProps {
  propertyId: string
  orgId: string
  tier: string
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>
  defaultValues: {
    name: string
    type: string
    address_line1: string
    address_line2: string | null
    suburb: string | null
    city: string
    province: string
    postal_code: string | null
    is_sectional_title: boolean | null
    managing_scheme_id: string | null
    levy_amount_cents: number | null
    levy_account_number: string | null
    erf_number: string | null
    sectional_title_number: string | null
    notes: string | null
  }
  managingSchemes: { id: string; company_name: string }[]
  currentLandlord: Landlord | null
  allLandlords: Landlord[]
  units: UnitSummary[]
  teamMembers: TeamMember[]
  managingAgentId: string | null
}

function BodyCorporateCard({
  defaultValues,
  managingSchemes,
}: {
  defaultValues: PropertyEditFormProps["defaultValues"]
  managingSchemes: { id: string; company_name: string }[]
}) {
  const [isSectional, setIsSectional] = useState(defaultValues.is_sectional_title ?? false)
  const [showSaReg, setShowSaReg] = useState(false)

  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Body corporate
      </p>

      {/* Toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isSectional}
          onClick={() => setIsSectional((v) => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${isSectional ? "bg-brand" : "bg-muted"}`}
        >
          <span
            className={`pointer-events-none block size-4 rounded-full bg-white shadow transition-transform ${isSectional ? "translate-x-4" : "translate-x-0"}`}
          />
        </button>
        <input type="hidden" name="is_sectional_title" value={isSectional ? "true" : "false"} />
        <Label className="cursor-pointer" onClick={() => setIsSectional((v) => !v)}>
          Part of a sectional title scheme
        </Label>
      </div>

      {isSectional && (
        <div className="space-y-3">
          {/* Managing scheme */}
          <div className="space-y-1.5">
            <Label>Managing scheme</Label>
            <Select name="managing_scheme_id" defaultValue={defaultValues.managing_scheme_id ?? ""}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {managingSchemes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Levy amount + account number */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Monthly levy (R)</Label>
              <Input
                name="levy_amount_cents_display"
                type="number"
                step="0.01"
                placeholder="1850.00"
                defaultValue={
                  defaultValues.levy_amount_cents != null
                    ? defaultValues.levy_amount_cents / 100
                    : ""
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Levy account number</Label>
              <Input
                name="levy_account_number"
                placeholder="BC-00412"
                defaultValue={defaultValues.levy_account_number ?? ""}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            The levy amount pre-fills as a lease charge when creating leases for units in this property.
          </p>

          {/* SA registration collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowSaReg((v) => !v)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              SA registration details
              {showSaReg ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {showSaReg && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-1.5">
                  <Label>Erf number</Label>
                  <Input
                    name="erf_number"
                    placeholder="ERF 1234"
                    defaultValue={defaultValues.erf_number ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sectional title number</Label>
                  <Input
                    name="sectional_title_number"
                    placeholder="SS 567/2005"
                    defaultValue={defaultValues.sectional_title_number ?? ""}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SA registration outside sectional toggle */}
      {!isSectional && (
        <div>
          <button
            type="button"
            onClick={() => setShowSaReg((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            SA registration details
            {showSaReg ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {showSaReg && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="space-y-1.5">
                <Label>Erf number</Label>
                <Input
                  name="erf_number"
                  placeholder="ERF 1234"
                  defaultValue={defaultValues.erf_number ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sectional title number</Label>
                <Input
                  name="sectional_title_number"
                  placeholder="SS 567/2005"
                  defaultValue={defaultValues.sectional_title_number ?? ""}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PropertyEditForm({
  propertyId,
  orgId,
  tier,
  action,
  defaultValues,
  managingSchemes,
  currentLandlord,
  allLandlords,
  units,
  teamMembers,
  managingAgentId,
}: PropertyEditFormProps) {
  const router = useRouter()

  const backHref =
    tier === "owner" ? "/properties" : `/properties/${propertyId}`

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await action(formData)
      return result ?? null
    },
    null
  )

  // Redirect on success
  useEffect(() => {
    if (state?.success === true) {
      toast.success("Property updated")
      router.push(backHref)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const cardClass = "rounded-xl border border-border/60 bg-surface-elevated px-5 py-4"
  const labelClass = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3"

  return (
    <form action={formAction}>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground hover:text-foreground mb-3 inline-block"
        >
          {tier === "owner" ? "← Back to my property" : "← Back to property"}
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl">{defaultValues.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {defaultValues.address_line1}, {defaultValues.city} · {defaultValues.type}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        {state?.error && (
          <p className="mt-3 text-sm text-danger">{state.error}</p>
        )}
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Card 1: Property details */}
          <div className={cardClass}>
            <p className={labelClass}>Property details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={defaultValues.name}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select name="type" defaultValue={defaultValues.type || "residential"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="mixed-use">Mixed-use</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Card 2: Address */}
          <div className={cardClass}>
            <p className={labelClass}>Address</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="address_line1">Street address *</Label>
                <Input
                  id="address_line1"
                  name="address_line1"
                  defaultValue={defaultValues.address_line1}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address_line2">Address line 2</Label>
                <Input
                  id="address_line2"
                  name="address_line2"
                  defaultValue={defaultValues.address_line2 ?? ""}
                  placeholder="Unit, floor, building"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="suburb">Suburb</Label>
                  <Input
                    id="suburb"
                    name="suburb"
                    defaultValue={defaultValues.suburb ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    defaultValue={defaultValues.city}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Province *</Label>
                  <Select name="province" defaultValue={defaultValues.province || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select province" />
                    </SelectTrigger>
                    <SelectContent>
                      {SA_PROVINCES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal_code">Postal code</Label>
                  <Input
                    id="postal_code"
                    name="postal_code"
                    defaultValue={defaultValues.postal_code ?? ""}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Bottom row — body corporate + notes side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <BodyCorporateCard
              defaultValues={defaultValues}
              managingSchemes={managingSchemes}
            />

            {/* Notes card */}
            <div className={cardClass}>
              <p className={labelClass}>Internal notes</p>
              <p className="text-xs text-muted-foreground mb-2">
                Not visible to tenants or applicants.
              </p>
              <Textarea
                name="notes"
                rows={4}
                defaultValue={defaultValues.notes ?? ""}
                className="resize-y"
              />
            </div>
          </div>
        </div>

        {/* Right column: sidebar */}
        <PropertyEditSidebar
          propertyId={propertyId}
          orgId={orgId}
          tier={tier}
          currentLandlord={currentLandlord}
          allLandlords={allLandlords}
          units={units}
          teamMembers={teamMembers}
          managingAgentId={managingAgentId}
        />
      </div>
    </form>
  )
}
