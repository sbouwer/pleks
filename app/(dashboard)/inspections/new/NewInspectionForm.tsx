"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ClipboardList, ChevronDown, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { createInspection } from "@/lib/actions/inspections"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import { toast } from "sonner"
import { InlineCombobox } from "@/components/shared/InlineCombobox"

interface Property {
  id: string
  name: string
  address_line1: string
  city: string
  type: string
}

interface Unit {
  id: string
  unit_number: string | null
  status: string
  bedrooms: number | null
}

interface ActiveLease {
  id: string
  tenant_id: string | null
  lease_type: string
  tenant_name?: string
}

interface Props {
  orgId: string
  initialPropertyId: string | null
  initialPropertyName: string | null
  initialUnitId: string | null
  initialUnitLabel: string | null
  initialLeaseId: string | null
  initialLeaseType: "residential" | "commercial" | null
  initialTenantId: string | null
  initialTenantName: string | null
  initialType: string | null
}

const INSPECTION_TYPES = [
  { value: "move_in", label: "Move-in", desc: "Condition at start of tenancy" },
  { value: "periodic", label: "Periodic", desc: "Routine mid-lease check" },
  { value: "move_out", label: "Move-out", desc: "Condition at end of tenancy" },
  { value: "pre_listing", label: "Pre-listing", desc: "Before advertising a vacancy" },
  { value: "commercial_handover", label: "Handover", desc: "Commercial lease commencement" },
  { value: "commercial_dilapidations", label: "Dilapidations", desc: "Commercial lease expiry" },
] as const

function unitDisplayLabel(u: Unit) {
  const num = u.unit_number ? `Unit ${u.unit_number}` : "Unit"
  return u.bedrooms ? `${num} — ${u.bedrooms} bed` : num
}

export function NewInspectionForm({
  orgId,
  initialPropertyId,
  initialPropertyName,
  initialUnitId,
  initialUnitLabel,
  initialLeaseId,
  initialLeaseType,
  initialTenantId,
  initialTenantName,
  initialType,
}: Readonly<Props>) {
  const [properties, setProperties] = useState<Property[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loadingProps, setLoadingProps] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(false)

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "")
  const [propertyName, setPropertyName] = useState(initialPropertyName ?? "")
  const [unitId, setUnitId] = useState(initialUnitId ?? "")
  const [unitLabel, setUnitLabel] = useState(initialUnitLabel ?? "")
  const [leaseId, setLeaseId] = useState(initialLeaseId ?? "")
  const [leaseType, setLeaseType] = useState<"residential" | "commercial">(initialLeaseType ?? "residential")
  const [tenantId, setTenantId] = useState(initialTenantId ?? "")
  const [tenantName, setTenantName] = useState(initialTenantName ?? "")
  const [coTenantNames, setCoTenantNames] = useState<string[]>([])
  const [inspectionType, setInspectionType] = useState(initialType ?? "move_in")
  const [scheduledDate, setScheduledDate] = useState("")
  const [isPreFilled, setIsPreFilled] = useState(!!initialPropertyId && !!initialUnitId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Load properties — auto-select if only one
  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("properties")
      .select("id, name, address_line1, city, type")
      .is("deleted_at", null)
      .order("name")
      .then(({ data: rows }) => {
        const list = (rows as Property[]) ?? []
        setProperties(list)
        setLoadingProps(false)
        if (!propertyId && list.length === 1) {
          handlePropertyChange(list[0].id)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // Load units when property selected — auto-select if only one
  useEffect(() => {
    if (!propertyId) return
    let cancelled = false
    const supabase = createClient()
    async function fetchUnits() {
      setLoadingUnits(true)
      const { data: rows } = await supabase
        .from("units")
        .select("id, unit_number, status, bedrooms, prospective_tenant_id")
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .order("unit_number")
      if (!cancelled) {
        const list = (rows as Unit[]) ?? []
        setUnits(list)
        setLoadingUnits(false)
        if (!unitId && list.length === 1) {
          handleUnitChange(list[0].id)
        }
      }
    }
    void fetchUnits()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  // Auto-fill tenant from active lease when unit is selected
  useEffect(() => {
    if (!unitId || initialTenantId) return
    let cancelled = false
    const supabase = createClient()

    async function applyProspectiveTenant(prospectiveTenantId: string) {
      const { data: tv } = await supabase
        .from("tenant_view")
        .select("first_name, last_name, company_name, entity_type")
        .eq("id", prospectiveTenantId)
        .single()
      if (!cancelled && tv) {
        const name = tv.entity_type === "juristic"
          ? (tv.company_name ?? "Company")
          : [tv.first_name, tv.last_name].filter(Boolean).join(" ")
        setTenantId(prospectiveTenantId)
        setTenantName(name)
      }
    }

    async function applyNoLeaseFallback() {
      const { data: unitRow } = await supabase
        .from("units")
        .select("prospective_tenant_id")
        .eq("id", unitId)
        .single()
      if (!cancelled && unitRow?.prospective_tenant_id) {
        await applyProspectiveTenant(unitRow.prospective_tenant_id)
      }
    }

    async function applyLeaseCoTenants(leaseId: string) {
      const { data: coResult } = await supabase
        .from("lease_co_tenants")
        .select("tenant_id, tenant_view(first_name, last_name, company_name, entity_type)")
        .eq("lease_id", leaseId)
      if (!cancelled && coResult) {
        const coNames = coResult.flatMap((row) => {
          const tv = Array.isArray(row.tenant_view) ? row.tenant_view[0] : row.tenant_view
          if (!tv) return []
          const n = (tv as { entity_type?: string; company_name?: string; first_name?: string; last_name?: string }).entity_type === "juristic"
            ? ((tv as { company_name?: string }).company_name ?? "Company")
            : [(tv as { first_name?: string }).first_name, (tv as { last_name?: string }).last_name].filter(Boolean).join(" ")
          return n ? [n] : []
        })
        setCoTenantNames(coNames)
      }
    }

    async function applyLeaseTenant(lease: ActiveLease) {
      if (!lease.tenant_id) return
      const { data: tv } = await supabase
        .from("tenant_view")
        .select("first_name, last_name, company_name, entity_type")
        .eq("id", lease.tenant_id)
        .single()
      if (!cancelled && tv) {
        const name = tv.entity_type === "juristic"
          ? (tv.company_name ?? "Company")
          : [tv.first_name, tv.last_name].filter(Boolean).join(" ")
        setTenantId(lease.tenant_id)
        setTenantName(name)
      }
      await applyLeaseCoTenants(lease.id)
    }

    async function fetchActiveLease() {
      const { data } = await supabase
        .from("leases")
        .select("id, tenant_id, lease_type")
        .eq("unit_id", unitId)
        .in("status", ["draft", "pending_signing", "active", "notice", "month_to_month"])
        .maybeSingle()
      if (cancelled || !data) {
        if (!cancelled) await applyNoLeaseFallback()
        return
      }
      const lease = data as ActiveLease
      setLeaseId(lease.id)
      setLeaseType(lease.lease_type === "commercial" ? "commercial" : "residential")
      await applyLeaseTenant(lease)
    }
    void fetchActiveLease()
    return () => { cancelled = true }
  }, [unitId, initialTenantId])

  function handlePropertyChange(pid: string) {
    setPropertyId(pid)
    setPropertyName(properties.find((p) => p.id === pid)?.name ?? "")
    setUnitId("")
    setUnitLabel("")
    setLeaseId("")
    setTenantId("")
    setTenantName("")
    setIsPreFilled(false)
    setUnits([])
    const prop = properties.find((p) => p.id === pid)
    if (prop) setLeaseType(prop.type === "commercial" ? "commercial" : "residential")
  }

  function handleUnitChange(uid: string) {
    setUnitId(uid)
    const u = units.find((u) => u.id === uid)
    setUnitLabel(u ? unitDisplayLabel(u) : "")
    // Clear auto-filled tenant so useEffect re-runs
    setLeaseId("")
    setTenantId("")
    setTenantName("")
    setCoTenantNames([])
  }

  function handleSelectTenant(t: PickedTenant) {
    setTenantId(t.id)
    setTenantName(t.name)
  }

  async function handleSubmit() {
    if (!propertyId) { setError("Please select a property"); return }
    if (!unitId) { setError("Please select a unit"); return }
    setError("")
    setLoading(true)

    const fd = new FormData()
    fd.set("property_id", propertyId)
    fd.set("unit_id", unitId)
    fd.set("inspection_type", inspectionType)
    fd.set("lease_type", leaseType)
    if (leaseId) fd.set("lease_id", leaseId)
    if (tenantId) fd.set("tenant_id", tenantId)
    if (scheduledDate) fd.set("scheduled_date", scheduledDate)

    const result = await createInspection(fd)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
    // On success, createInspection redirects
  }

  const selectedPropertyName = properties.find((p) => p.id === propertyId)?.name ?? ""
  const foundUnit = units.find((u) => u.id === unitId)
  const selectedUnitLabel = unitLabel || (foundUnit ? unitDisplayLabel(foundUnit) : "")

  return (
    <div className="space-y-8">

      {/* Property, Unit & Tenant — 2-column on larger screens */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property &amp; tenant</h2>

        {isPreFilled && initialPropertyName && initialUnitLabel ? (
          <Card className="border-brand/30 bg-brand/5">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="size-5 text-brand mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{propertyName || initialPropertyName}</p>
                    <p className="text-xs text-muted-foreground">{unitLabel || initialUnitLabel}</p>
                  </div>
                </div>
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => setIsPreFilled(false)}>
                  Change
                </button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left column: property + unit */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Property *</Label>
                <InlineCombobox
                  value={propertyId}
                  displayValue={selectedPropertyName}
                  placeholder="Select a property…"
                  items={properties}
                  getSearchText={(p) => `${p.name} ${p.address_line1} ${p.city}`}
                  renderItem={(p) => (
                    <span>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-1 text-xs">{p.address_line1}, {p.city}</span>
                    </span>
                  )}
                  onSelect={(p) => handlePropertyChange(p.id)}
                  loading={loadingProps}
                />
              </div>

              {propertyId && (
                <div className="space-y-2">
                  <Label>Unit *</Label>
                  <InlineCombobox
                    value={unitId}
                    displayValue={selectedUnitLabel}
                    placeholder="Select a unit…"
                    items={units}
                    getSearchText={(u) => unitDisplayLabel(u)}
                    renderItem={(u) => (
                      <span>
                        <span>{unitDisplayLabel(u)}</span>
                        <span className={cn("ml-1 text-xs capitalize", u.status === "occupied" ? "text-success" : "text-muted-foreground")}>
                          · {u.status}
                        </span>
                      </span>
                    )}
                    onSelect={(u) => handleUnitChange(u.id)}
                    loading={loadingUnits}
                  />
                </div>
              )}
            </div>

            {/* Right column: tenant */}
            <div className="space-y-2">
              <Label>
                Tenant <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              {tenantId && tenantName ? (
                <Card className="border-brand/30 bg-brand/5">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="size-4 text-brand mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{tenantName}</p>
                          {coTenantNames.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              + {coTenantNames.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">From active lease</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TenantPicker
                          orgId={orgId}
                          onSelect={handleSelectTenant}
                          returnTo="/inspections/new"
                          trigger={
                            <button type="button" className="text-xs text-brand hover:underline">Change</button>
                          }
                        />
                        <button
                          type="button"
                          onClick={() => { setTenantId(""); setTenantName(""); setCoTenantNames([]) }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <TenantPicker
                  orgId={orgId}
                  onSelect={handleSelectTenant}
                  returnTo="/inspections/new"
                  trigger={
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:border-brand/50 transition-colors"
                    >
                      <UserRound className="size-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </button>
                  }
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Inspection type */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspection type</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INSPECTION_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setInspectionType(t.value)}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                inspectionType === t.value
                  ? "border-brand bg-brand/5 ring-1 ring-brand"
                  : "border-border/60 hover:border-brand/40 hover:bg-muted/30"
              )}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Lease type */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lease type</h2>
        <div className="flex gap-2">
          {(["residential", "commercial"] as const).map((lt) => (
            <button
              key={lt}
              type="button"
              onClick={() => setLeaseType(lt)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                leaseType === lt
                  ? "border-brand bg-brand text-white"
                  : "border-border/60 hover:border-brand/40"
              )}
            >
              <ClipboardList className="size-3.5" />
              {lt.charAt(0).toUpperCase() + lt.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {/* Scheduled date */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scheduled date <span className="normal-case font-normal text-muted-foreground">(optional)</span>
        </h2>
        <div className="max-w-xs">
          <Input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end pt-2">
        <Button onClick={handleSubmit} disabled={loading} size="lg">
          {loading ? "Creating…" : "Schedule inspection"}
        </Button>
      </div>
    </div>
  )
}
