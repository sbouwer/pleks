"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WizardData, LocalCharge } from "../LeaseWizard"

interface Property {
  id: string
  name: string
  address_line1: string
  city: string
  type: string
  is_sectional_title: boolean
  levy_amount_cents: number | null
}

interface Unit {
  id: string
  unit_number: string | null
  status: string
  asking_rent_cents: number | null
  bedrooms: number | null
  bathrooms: number | null
}

interface Props {
  data: WizardData
  onNext: (updates: Partial<WizardData>) => void
}

function unitLabel(u: Unit) {
  const num = u.unit_number ? `Unit ${u.unit_number}` : "Unit"
  const beds = u.bedrooms ? `${u.bedrooms} bed` : null
  const baths = u.bathrooms ? `${u.bathrooms} bath` : null
  const details = [beds, baths].filter(Boolean).join(" · ")
  return details ? `${num} — ${details}` : num
}

/** Inline combobox: clicking the button turns it into a search input; list renders below. */
function InlineCombobox<T extends { id: string }>({
  id,
  value,
  placeholder,
  displayValue,
  items,
  getSearchText,
  renderItem,
  onSelect,
  loading,
}: Readonly<{
  id?: string
  value: string
  placeholder: string
  displayValue: string
  items: T[]
  getSearchText: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  onSelect: (item: T) => void
  loading?: boolean
}>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function openCombobox() {
    setSearch("")
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = items.filter((item) =>
    getSearchText(item).toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="h-9 rounded-lg bg-muted animate-pulse" />

  return (
    <div ref={containerRef} className="relative" id={id}>
      {open ? (
        <div className="flex items-center gap-2 w-full rounded-lg border border-brand bg-background px-3 py-2 ring-1 ring-brand">
          <Search className="size-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search…`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openCombobox}
          className="flex items-center gap-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:border-brand/50 transition-colors"
        >
          <span className="flex-1 text-sm truncate">{value ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}</span>
          <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
        </button>
      )}

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
          ) : (
            filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(item); setOpen(false) }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                    item.id === value && "bg-brand/10 font-medium"
                  )}
                >
                  {renderItem(item)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export function PropertyUnitStep({ data, onNext }: Readonly<Props>) {
  const { orgId } = useOrg()
  const [properties, setProperties] = useState<Property[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [propertyId, setPropertyId] = useState(data.propertyId)
  const [unitId, setUnitId] = useState(data.unitId)
  const [leaseType, setLeaseType] = useState<"residential" | "commercial">(data.leaseType)
  const [loadingProps, setLoadingProps] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [error, setError] = useState("")
  const [isPreFilled, setIsPreFilled] = useState(!!data.propertyId && !!data.unitId)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("properties")
      .select("id, name, address_line1, city, type, is_sectional_title, levy_amount_cents")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data: rows }) => {
        setProperties((rows as Property[]) ?? [])
        setLoadingProps(false)
      })
  }, [orgId])

  useEffect(() => {
    if (!propertyId) return
    let cancelled = false
    const supabase = createClient()
    async function fetchUnits() {
      setLoadingUnits(true)
      const { data: rows } = await supabase
        .from("units")
        .select("id, unit_number, status, asking_rent_cents, bedrooms, bathrooms")
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .order("unit_number")
      if (!cancelled) {
        setUnits((rows as Unit[]) ?? [])
        setLoadingUnits(false)
      }
    }
    void fetchUnits()
    return () => { cancelled = true }
  }, [propertyId])

  function handlePropertyChange(p: Property) {
    setPropertyId(p.id)
    setUnitId("")
    setIsPreFilled(false)
    setUnits([])
    setLeaseType(p.type === "commercial" ? "commercial" : "residential")
  }

  function handleNext() {
    if (!propertyId) { setError("Please select a property"); return }
    if (!unitId) { setError("Please select a unit"); return }
    setError("")

    const prop = properties.find((p) => p.id === propertyId)
    const unit = units.find((u) => u.id === unitId)
    const selectedUnit = unit ?? { unit_number: null, status: "", asking_rent_cents: null, bedrooms: null, bathrooms: null, id: unitId }

    let initialCharges = data.charges
    if (prop?.is_sectional_title && prop.levy_amount_cents && initialCharges.length === 0) {
      const bcCharge: LocalCharge = {
        id: "bc-levy-prefill",
        description: "Body corporate levy",
        charge_type: "body_corporate_levy",
        amount_cents: prop.levy_amount_cents,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        payable_to: "body_corporate",
        deduct_from_owner_payment: true,
      }
      initialCharges = [bcCharge]
    }

    onNext({
      propertyId,
      propertyName: prop?.name ?? "",
      unitId,
      unitLabel: unit ? unitLabel(unit) : "",
      leaseType,
      askingRentCents: selectedUnit.asking_rent_cents,
      bcLevyCents: prop?.levy_amount_cents ?? null,
      charges: initialCharges,
    })
  }

  const selectedProp = properties.find((p) => p.id === propertyId)
  const selectedUnit = units.find((u) => u.id === unitId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Property &amp; unit</h2>
        <p className="text-sm text-muted-foreground">Select which unit this lease is for.</p>
      </div>

      {isPreFilled && data.propertyName && data.unitLabel ? (
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-brand mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{data.propertyName}</p>
                  <p className="text-xs text-muted-foreground">{data.unitLabel}</p>
                  <p className="text-xs text-muted-foreground capitalize">{leaseType} lease</p>
                </div>
              </div>
              <button type="button" className="text-xs text-brand hover:underline flex-shrink-0" onClick={() => setIsPreFilled(false)}>
                Change
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Property *</Label>
            <InlineCombobox<Property>
              value={propertyId}
              placeholder="Select a property…"
              displayValue={selectedProp?.name ?? ""}
              items={properties}
              loading={loadingProps}
              getSearchText={(p) => `${p.name} ${p.address_line1} ${p.city}`}
              onSelect={handlePropertyChange}
              renderItem={(p) => (
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground ml-1 text-xs">{p.address_line1}, {p.city}</span>
                </span>
              )}
            />
          </div>

          {propertyId && (
            <div className="space-y-2">
              <Label>Unit *</Label>
              <InlineCombobox<Unit>
                value={unitId}
                placeholder="Select a unit…"
                displayValue={selectedUnit ? unitLabel(selectedUnit) : ""}
                items={units}
                loading={loadingUnits}
                getSearchText={(u) => `${u.unit_number ?? ""} ${u.bedrooms ?? ""} ${u.status}`}
                onSelect={(u) => setUnitId(u.id)}
                renderItem={(u) => (
                  <span>
                    <span>{unitLabel(u)}</span>
                    <span className={cn("ml-1 text-xs capitalize", u.status === "occupied" ? "text-danger" : "text-success")}>
                      · {u.status === "occupied" ? "Occupied — active lease" : u.status}
                    </span>
                  </span>
                )}
              />
            </div>
          )}

          {selectedUnit && (
            <div className="space-y-2">
              <Label>Lease type</Label>
              <Select value={leaseType} onValueChange={(v) => setLeaseType(v as "residential" | "commercial")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
              {selectedProp?.type && (
                <p className="text-xs text-muted-foreground">Auto-detected from property type.</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={handleNext}>Continue →</Button>
      </div>
    </div>
  )
}
