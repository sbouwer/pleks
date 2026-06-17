"use client"

/**
 * components/leases/steps/PropertyBuildingUnitStep.tsx — step 1 of the lease modal: property → building → unit
 *
 * Auth:   client-only; reads org-scoped properties/buildings/units via the anon client (RLS)
 * Data:   properties, buildings (units.building_id), units (org-scoped); prefills the rule-set from the unit
 * Notes:  Content-only (footer-driven nav). Adds the building tier (ADDENDUM_LEASE_CREATION_MODAL §1/D-5):
 *         auto-selects + collapses when a property has exactly one building; shows a building combobox +
 *         an "Erf → Building → Unit" wayfinding crumb when several. Units filter by the selected building.
 *         Registers a validate-then-commit submit handler the modal footer's Continue invokes.
 */
import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, ChevronDown, ChevronRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { contactDisplayName } from "@/lib/contacts/displayName"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { LocalCharge } from "../wizardData"
import type { StepHandle } from "../stepHandle"

interface Property {
  id: string
  name: string
  address_line1: string
  city: string
  type: string
  is_sectional_title: boolean
  levy_amount_cents: number | null
  managing_scheme_id: string | null
}

interface Building {
  id: string
  name: string
  building_code: string | null
}

interface Unit {
  id: string
  unit_number: string | null
  status: string
  building_id: string | null
  asking_rent_cents: number | null
  default_lease_period_months: number | null
  bedrooms: number | null
  bathrooms: number | null
  parking_bays: number | null
  prospective_tenant_id?: string | null
  prospective_co_tenant_ids?: string[]
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
  value, placeholder, displayValue, items, getSearchText, renderItem, onSelect, loading,
}: Readonly<{
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

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = items.filter((item) => getSearchText(item).toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="h-9 rounded-[var(--r-button)] bg-muted animate-pulse" />

  return (
    <div ref={containerRef} className="relative">
      {open ? (
        <div className="flex items-center gap-2 w-full rounded-[var(--r-button)] border border-primary bg-background px-3 py-2 ring-1 ring-primary">
          <Search className="size-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openCombobox}
          className="flex items-center gap-2 w-full rounded-[var(--r-button)] border border-border/60 bg-background px-3 py-2 text-left hover:border-primary/50 transition-colors"
        >
          <span className="flex-1 text-sm truncate">{value ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}</span>
          <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
        </button>
      )}

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-[var(--r-button)] border border-border bg-popover shadow-lg max-h-60 overflow-y-auto">
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
                    item.id === value && "bg-primary/10 font-medium"
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

function rowToName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null) {
  return contactDisplayName(row, "")
}

interface Props {
  register: (handle: StepHandle) => void
}

export function PropertyBuildingUnitStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()
  const { orgId } = useOrg()
  const [properties, setProperties] = useState<Property[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [propertyId, setPropertyId] = useState(data.propertyId)
  const [buildingId, setBuildingId] = useState(data.buildingId)
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
      .select("id, name, address_line1, city, type, is_sectional_title, levy_amount_cents, managing_scheme_id")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data: rows, error: err }) => {
        if (err) console.error("PropertyBuildingUnitStep: load properties failed:", err.message)
        const list = (rows as Property[]) ?? []
        setProperties(list)
        setLoadingProps(false)
        // Sole property (e.g. Owner tier) → auto-select so it's visibly chosen, not silently skipped.
        if (list.length === 1 && !data.propertyId) {
          setPropertyId(list[0].id)
          setLeaseType(list[0].type === "commercial" ? "commercial" : "residential")
        }
      })
  }, [orgId, data.propertyId])

  // Load buildings + units for the selected property; auto-select a single building.
  useEffect(() => {
    if (!propertyId) { setBuildings([]); setUnits([]); return }
    let cancelled = false
    const supabase = createClient()
    async function fetchPropertyChildren() {
      setLoadingUnits(true)
      const [buildingsRes, unitsRes] = await Promise.all([
        supabase
          .from("buildings")
          .select("id, name, building_code")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("units")
          .select("id, unit_number, status, building_id, asking_rent_cents, default_lease_period_months, bedrooms, bathrooms, parking_bays, prospective_tenant_id, prospective_co_tenant_ids")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .eq("is_archived", false)
          .order("unit_number"),
      ])
      if (cancelled) return
      if (buildingsRes.error) console.error("PropertyBuildingUnitStep: load buildings failed:", buildingsRes.error.message)
      if (unitsRes.error) console.error("PropertyBuildingUnitStep: load units failed:", unitsRes.error.message)
      const bRows = (buildingsRes.data as Building[]) ?? []
      const uRows = (unitsRes.data as Unit[]) ?? []
      setBuildings(bRows)
      setUnits(uRows)
      // Auto-select + collapse a single building / sole unit so a 1-property/1-unit org isn't asked to "pick".
      if (bRows.length === 1) setBuildingId((prev) => prev || bRows[0].id)
      if (bRows.length <= 1 && uRows.length === 1) setUnitId((prev) => prev || uRows[0].id)
      setLoadingUnits(false)
    }
    void fetchPropertyChildren()
    return () => { cancelled = true }
  }, [propertyId])

  function handlePropertyChange(p: Property) {
    setPropertyId(p.id)
    setBuildingId("")
    setUnitId("")
    setIsPreFilled(false)
    setUnits([])
    setBuildings([])
    setLeaseType(p.type === "commercial" ? "commercial" : "residential")
  }

  function handleBuildingChange(b: Building) {
    setBuildingId(b.id)
    setUnitId("")
  }

  const multiBuilding = buildings.length > 1
  // When several buildings exist, only show units once a building is chosen; otherwise show all units.
  const visibleUnits = multiBuilding && buildingId
    ? units.filter((u) => u.building_id === buildingId)
    : units

  async function resolveProspectiveTenants(unit: Unit | undefined) {
    let tenantId = data.tenantId
    let tenantName = data.tenantName
    let coTenants = data.coTenants
    const prospTenantId = unit?.prospective_tenant_id
    const prospCoIds = unit?.prospective_co_tenant_ids ?? []
    if (!tenantId && prospTenantId) {
      const supabase = createClient()
      const [primaryRes, ...coResults] = await Promise.all([
        supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", prospTenantId).single(),
        ...prospCoIds.map((id) =>
          supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
            .then((r) => ({ id, row: r.data }))
        ),
      ])
      tenantId = prospTenantId
      tenantName = rowToName(primaryRes.data)
      coTenants = (coResults as { id: string; row: Parameters<typeof rowToName>[0] }[]).map((r) => ({ id: r.id, name: rowToName(r.row) }))
    }
    return { tenantId, tenantName, coTenants }
  }

  async function submit(): Promise<boolean> {
    if (!propertyId) { setError("Please select a property"); return false }
    if (multiBuilding && !buildingId) { setError("Please select a building"); return false }
    if (!unitId) { setError("Please select a unit"); return false }
    setError("")

    const prop = properties.find((p) => p.id === propertyId)
    const unit = units.find((u) => u.id === unitId)
    const building = buildings.find((b) => b.id === buildingId)
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

    const { tenantId, tenantName, coTenants } = await resolveProspectiveTenants(unit)

    patch({
      propertyId,
      propertyName: prop?.name ?? "",
      buildingId: building?.id ?? "",
      buildingName: building?.name ?? "",
      unitId,
      unitLabel: unit ? unitLabel(unit) : "",
      leaseType,
      askingRentCents: selectedUnit.asking_rent_cents,
      defaultLeasePeriodMonths: unit?.default_lease_period_months ?? null,
      bcLevyCents: prop?.levy_amount_cents ?? null,
      isSectionalTitle: prop?.is_sectional_title ?? false,
      parkingBays: unit?.parking_bays ?? 0,
      hasSchemeRules: !!(prop?.managing_scheme_id),
      charges: initialCharges,
      tenantId,
      tenantName,
      coTenants,
    })
    return true
  }

  register({ submit })

  const selectedProp = properties.find((p) => p.id === propertyId)
  const selectedBuilding = buildings.find((b) => b.id === buildingId)
  const selectedUnit = units.find((u) => u.id === unitId)
  let buildingDisplay = ""
  if (selectedBuilding) {
    buildingDisplay = selectedBuilding.building_code
      ? `${selectedBuilding.name} (${selectedBuilding.building_code})`
      : selectedBuilding.name
  }

  return (
    <div className="space-y-6">
      {isPreFilled && data.propertyName && data.unitLabel ? (
        <div className="rounded-[var(--r-button)] border border-primary/30 bg-primary/[0.03] p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{data.propertyName}</p>
                <p className="text-xs text-muted-foreground">{data.unitLabel}</p>
                <p className="text-xs text-muted-foreground capitalize">{leaseType} lease</p>
              </div>
            </div>
            <button type="button" className="text-xs text-primary hover:underline flex-shrink-0" onClick={() => setIsPreFilled(false)}>
              Change
            </button>
          </div>
        </div>
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

          {/* Building tier — only shown for multi-building estates (auto-selected + hidden when one). */}
          {propertyId && multiBuilding && (
            <div className="space-y-2">
              <Label>Building *</Label>
              <InlineCombobox<Building>
                value={buildingId}
                placeholder="Select a building…"
                displayValue={buildingDisplay}
                items={buildings}
                getSearchText={(b) => `${b.name} ${b.building_code ?? ""}`}
                onSelect={handleBuildingChange}
                renderItem={(b) => (
                  <span>
                    <span className="font-medium">{b.name}</span>
                    {b.building_code && <span className="text-muted-foreground ml-1 text-xs">{b.building_code}</span>}
                  </span>
                )}
              />
            </div>
          )}

          {propertyId && (!multiBuilding || buildingId) && (
            <div className="space-y-2">
              <Label>Unit *</Label>
              <InlineCombobox<Unit>
                value={unitId}
                placeholder="Select a unit…"
                displayValue={selectedUnit ? unitLabel(selectedUnit) : ""}
                items={visibleUnits}
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

      {/* Wayfinding crumb — only meaningful on multi-building estates (D-5). */}
      {multiBuilding && (selectedProp || selectedBuilding || selectedUnit) && (
        <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
          <span className={cn(selectedProp && "text-foreground font-medium")}>{selectedProp?.name ?? "Erf"}</span>
          <ChevronRight className="size-3" />
          <span className={cn(selectedBuilding && "text-foreground font-medium")}>{selectedBuilding?.name ?? "Building"}</span>
          <ChevronRight className="size-3" />
          <span className={cn(selectedUnit && "text-foreground font-medium")}>{selectedUnit ? unitLabel(selectedUnit) : "Unit"}</span>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
