"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, AlertTriangle, CheckCircle2, Pencil, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { createMaintenanceRequest, fetchUnitsForProperty, fetchTenantForUnit, fetchPropertyContactsAction } from "@/lib/actions/maintenance"
import { fetchBuildingsForProperty } from "@/lib/actions/buildings"
import { formatZAR } from "@/lib/constants"
import { InlineCombobox } from "@/components/shared/InlineCombobox"
import { FormSelect } from "@/components/ui/FormSelect"

interface Property {
  id: string
  name: string
  address_line1: string | null
  city: string | null
}

interface Unit {
  id: string
  unit_number: string
  access_instructions: string | null
  prospective_tenant_id: string | null
}

interface Tenant {
  id: string
  name: string
  phone: string | null
}

interface Contractor {
  id: string
  name: string
  specialities: string[]
}

interface TriageResult {
  category: string
  urgency: string
  urgency_reason: string
  suggested_action: string
}

const CATEGORY_LABELS: Record<string, string> = {
  electrical: "⚡ Electrical",
  plumbing: "🔧 Plumbing",
  hvac: "❄️ HVAC",
  structural: "🏗️ Structural",
  roofing: "🏠 Roofing",
  windows_doors: "🚪 Windows & Doors",
  appliances: "🍳 Appliances",
  garden: "🌿 Garden",
  pest_control: "🐛 Pest Control",
  painting: "🎨 Painting",
  flooring: "🪵 Flooring",
  security: "🔒 Security",
  access_control: "🔑 Access Control",
  cleaning: "🧹 Cleaning",
  other: "📋 Other",
}

const URGENCY_LABELS: Record<string, string> = {
  emergency: "🚨 Emergency",
  urgent: "🟠 Urgent",
  routine: "🟡 Routine",
  cosmetic: "⚪ Cosmetic",
}

const CATEGORIES = Object.keys(CATEGORY_LABELS)
const URGENCIES = ["emergency", "urgent", "routine", "cosmetic"]

// Maps category to contractor speciality keywords for filtering
const CATEGORY_SPECIALITY: Record<string, string[]> = {
  electrical: ["electrical", "electrician"],
  plumbing: ["plumbing", "plumber"],
  hvac: ["hvac", "air", "heating", "cooling"],
  structural: ["building", "structural", "construction"],
  roofing: ["roofing", "roof"],
  garden: ["garden", "landscaping"],
  pest_control: ["pest"],
  painting: ["painting", "painter"],
  flooring: ["flooring", "tiles"],
  security: ["security", "alarm", "cctv"],
}

interface ContactOption { label: string; name: string; phone: string; role: string }

// ── Helpers outside the component to reduce its cognitive complexity ──────────

function buildSubmitFormData(args: {
  unitId: string; propertyId: string; buildingId: string; title: string; description: string
  leaseId: string; tenant: { id: string } | null; contractorId: string
  accessInstructions: string; specialInstructions: string
  showCustomContact: boolean; customContactName: string; customContactPhone: string
  contactOptions: ContactOption[]; selectedContactRole: string
  estimatedCostInput: string; triageConfirmed: boolean; overrideCategory: string; overrideUrgency: string
}): FormData {
  const fd = new FormData()
  fd.set("unit_id", args.unitId)
  fd.set("property_id", args.propertyId)
  if (args.buildingId) fd.set("building_id", args.buildingId)
  fd.set("title", args.title)
  fd.set("description", args.description)
  if (args.leaseId) fd.set("lease_id", args.leaseId)
  if (args.tenant) fd.set("tenant_id", args.tenant.id)
  if (args.contractorId) fd.set("contractor_id", args.contractorId)
  if (args.accessInstructions.trim()) fd.set("access_instructions", args.accessInstructions)
  if (args.specialInstructions.trim()) fd.set("special_instructions", args.specialInstructions)
  if (args.showCustomContact) {
    if (args.customContactName.trim()) fd.set("contact_name", args.customContactName)
    if (args.customContactPhone.trim()) fd.set("contact_phone", args.customContactPhone)
  } else {
    const selected = args.contactOptions.find((c) => c.role === args.selectedContactRole)
    if (selected) { fd.set("contact_name", selected.name); fd.set("contact_phone", selected.phone) }
  }
  if (args.estimatedCostInput) fd.set("estimated_cost", args.estimatedCostInput)
  if (args.triageConfirmed && args.overrideCategory) {
    fd.set("category_override", args.overrideCategory)
    fd.set("urgency_override", args.overrideUrgency || "routine")
  }
  return fd
}

function filterContractors(contractors: Contractor[], effectiveCategory: string): Contractor[] {
  if (!effectiveCategory) return contractors
  const keywords = CATEGORY_SPECIALITY[effectiveCategory] ?? []
  if (keywords.length === 0) return contractors
  return contractors.filter((c) =>
    c.specialities.some((s) => keywords.some((k) => s.toLowerCase().includes(k)))
  )
}

interface Props {
  orgId: string
  properties: Property[]
  initialPropertyId: string | null
  initialUnits: Unit[]
  initialUnitId: string | null
  initialTenant: Tenant | null
  initialLeaseId: string | null
  initialAccessInstructions: string | null
  initialContacts: ContactOption[]
  approvalThresholdCents: number
  contractors: Contractor[]
}

export function LogMaintenanceForm({
  properties,
  initialPropertyId,
  initialUnits,
  initialUnitId,
  initialTenant,
  initialLeaseId,
  initialAccessInstructions,
  initialContacts,
  approvalThresholdCents,
  contractors,
}: Readonly<Props>) {
  // Location state
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "")
  const [units, setUnits] = useState<Unit[]>(initialUnits)
  // Client-side fallback: if server didn't auto-select (multiple units) but only 1 exists, pick it
  const [unitId, setUnitId] = useState(initialUnitId ?? (initialUnits.length === 1 ? initialUnits[0].id : ""))
  const [tenant, setTenant] = useState<Tenant | null>(initialTenant)
  const [leaseId, setLeaseId] = useState(initialLeaseId ?? "")
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [loadingTenant, setLoadingTenant] = useState(false)
  // Track user-initiated changes (vs server-provided initial state)
  const [userChangedProperty, setUserChangedProperty] = useState(false)
  const [userChangedUnit, setUserChangedUnit] = useState(false)
  // Building state (multi-building properties only)
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [buildingId, setBuildingId] = useState("")

  // Access contact state — tenant + agent + landlord from server; tenant updates on unit change
  const [contactOptions, setContactOptions] = useState<ContactOption[]>(initialContacts)
  const [selectedContactRole, setSelectedContactRole] = useState(initialContacts[0]?.role ?? "")
  const [customContactName, setCustomContactName] = useState("")
  const [customContactPhone, setCustomContactPhone] = useState("")
  const [showCustomContact, setShowCustomContact] = useState(initialContacts.length === 0)

  // Problem state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [accessInstructions, setAccessInstructions] = useState(initialAccessInstructions ?? "")
  const [specialInstructions, setSpecialInstructions] = useState("")

  // Triage state
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null)
  const [triaging, setTriaging] = useState(false)
  const [triageConfirmed, setTriageConfirmed] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [overrideCategory, setOverrideCategory] = useState("")
  const [overrideUrgency, setOverrideUrgency] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Contractor state
  const [contractorId, setContractorId] = useState("")
  const [preferredContractor, setPreferredContractor] = useState<{ id: string; name: string; phone: string | null; email: string | null; scope: string } | null>(null)
  const [loadingPreferred, setLoadingPreferred] = useState(false)
  const [showContractorPicker, setShowContractorPicker] = useState(false)

  // Cost state
  const [estimatedCostInput, setEstimatedCostInput] = useState("")
  const estimatedCostCents = estimatedCostInput ? Math.round(parseFloat(estimatedCostInput) * 100) : 0
  const aboveThreshold = estimatedCostCents > 0 && estimatedCostCents > approvalThresholdCents

  // Submit state
  const [submitting, setSubmitting] = useState(false)

  const effectiveCategory = overriding ? overrideCategory : triageResult?.category ?? ""
  const effectiveUrgency = overriding ? overrideUrgency : triageResult?.urgency ?? ""

  // Fetch units + property contacts + buildings when property changes — only when USER changes it, not on mount
  useEffect(() => {
    if (!propertyId) { setUnits([]); setUnitId(""); setTenant(null); setLeaseId(""); setContactOptions([]); setBuildings([]); setBuildingId(""); return }
    if (!userChangedProperty) return  // server already provided initialUnits
    let cancelled = false
    setLoadingUnits(true)
    setUnitId("")
    setTenant(null)
    setLeaseId("")
    setBuildingId("")
    async function run() {
      try {
        const [unitList, propContacts, bldList] = await Promise.all([
          fetchUnitsForProperty(propertyId),
          fetchPropertyContactsAction(propertyId),
          fetchBuildingsForProperty(propertyId),
        ])
        if (!cancelled) setBuildings(bldList.filter((b) => b.is_visible_in_ui))
        if (cancelled) return
        setUnits(unitList)
        if (unitList.length === 1) {
          setUnitId(unitList[0].id)
          setUserChangedUnit(true)  // trigger tenant fetch even though user didn't manually pick
        }
        setContactOptions(propContacts)
        setSelectedContactRole(propContacts[0]?.role ?? "")
        setShowCustomContact(propContacts.length === 0)
      } finally {
        if (!cancelled) setLoadingUnits(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [propertyId, userChangedProperty])

  // Fetch tenant + build contact options when unit changes
  useEffect(() => {
    if (!unitId) {
      setTenant(null)
      setLeaseId("")
      // Keep property-level contacts (agent/landlord) but remove tenant
      setContactOptions((prev) => prev.filter((c) => c.role !== "tenant"))
      return
    }
    const unit = units.find((u) => u.id === unitId)
    if (unit?.access_instructions && !accessInstructions) {
      setAccessInstructions(unit.access_instructions)
    }
    if (!userChangedUnit && initialTenant) return  // server already resolved tenant
    let cancelled = false
    setLoadingTenant(true)
    async function run() {
      try {
        const result = await fetchTenantForUnit(unitId, unit?.prospective_tenant_id ?? null)
        if (cancelled) return

        let tenantContact: ContactOption | null = null

        if (result.tenant) {
          setTenant(result.tenant)
          setLeaseId(result.leaseId ?? "")
          tenantContact = { label: `Tenant \u2014 ${result.tenant.name}`, name: result.tenant.name, phone: result.tenant.phone ?? "", role: "tenant" }
        } else {
          setTenant(null)
          setLeaseId("")
        }

        setContactOptions((prev) => {
          const propertyContacts = prev.filter((c) => c.role !== "tenant")
          return tenantContact ? [tenantContact, ...propertyContacts] : propertyContacts
        })
        if (tenantContact) {
          setSelectedContactRole("tenant")
          setShowCustomContact(false)
        }
      } finally {
        if (!cancelled) setLoadingTenant(false)
      }
    }
    void run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId])

  // Debounced triage after title + description both have content
  useEffect(() => {
    if (!title.trim() || !description.trim() || triageConfirmed) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setTriaging(true)
      try {
        const res = await fetch("/api/maintenance/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        })
        if (res.ok) {
          const data = await res.json() as TriageResult
          setTriageResult(data)
          setTriageConfirmed(false)
        }
      } catch { /* non-critical */ } finally {
        setTriaging(false)
      }
    }, 1200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description])

  // Fetch preferred contractor when category + property confirmed
  const fetchPreferredContractor = useCallback(async (category: string, propId: string) => {
    if (!category || !propId) return
    setLoadingPreferred(true)
    try {
      const res = await fetch(`/api/maintenance/preferred-contractor?category=${category}&property=${propId}`)
      if (res.ok) {
        const data = await res.json() as { contractor: { id: string; company_name: string; first_name: string; last_name: string; phone: string; email: string } | null; scope: string | null }
        if (data.contractor) {
          const c = data.contractor
          const name = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
          setPreferredContractor({ id: c.id, name, phone: c.phone, email: c.email, scope: data.scope ?? "org" })
          setContractorId(c.id)
        } else {
          setPreferredContractor(null)
        }
      }
    } catch { /* non-critical */ } finally {
      setLoadingPreferred(false)
    }
  }, [])

  function handleConfirmTriage() {
    setTriageConfirmed(true)
    setOverriding(false)
    if (triageResult && propertyId) {
      fetchPreferredContractor(triageResult.category, propertyId)
    }
  }

  function handleConfirmOverride() {
    setTriageConfirmed(true)
    setOverriding(false)
    if (overrideCategory && propertyId) {
      fetchPreferredContractor(overrideCategory, propertyId)
    }
  }

  function handleResetTriage() {
    setTriageResult(null)
    setTriageConfirmed(false)
    setOverriding(false)
    setPreferredContractor(null)
    setContractorId("")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!unitId || !propertyId) { toast.error("Select a property and unit"); return }
    if (!title.trim() || !description.trim()) { toast.error("Title and description required"); return }

    setSubmitting(true)
    const formData = buildSubmitFormData({
      unitId, propertyId, buildingId, title, description, leaseId, tenant, contractorId,
      accessInstructions, specialInstructions, showCustomContact, customContactName,
      customContactPhone, contactOptions, selectedContactRole, estimatedCostInput,
      triageConfirmed, overrideCategory, overrideUrgency,
    })
    const result = await createMaintenanceRequest(formData)
    if (result?.error) {
      toast.error(result.error)
      setSubmitting(false)
    }
    // On success, createMaintenanceRequest redirects — no need to setSubmitting(false)
  }

  const selectedProperty = properties.find((p) => p.id === propertyId)
  const selectedUnit = units.find((u) => u.id === unitId)
  const locationConfirmed = !!(propertyId && unitId)

  // Filter contractors by speciality for the picker
  const filtered = filterContractors(contractors, effectiveCategory)
  const pickableContractors = filtered.length > 0 ? filtered : contractors

  // ── Render helpers — extracted to reduce cognitive complexity ─────────────

  function renderWhereSection() {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Where</p>
        {locationConfirmed ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{selectedProperty?.name} · {selectedUnit?.unit_number}</p>
              {tenant && <p className="text-xs text-muted-foreground mt-0.5">Tenant: {tenant.name}{tenant.phone ? ` · ${tenant.phone}` : ""}</p>}
              {!tenant && loadingTenant && <p className="text-xs text-muted-foreground mt-0.5">Loading tenant…</p>}
              {!tenant && !loadingTenant && <p className="text-xs text-muted-foreground mt-0.5">No active tenant</p>}
            </div>
            <button type="button" onClick={() => { setUnitId(""); setPropertyId("") }} className="text-xs text-brand hover:underline shrink-0">Change</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Property *</Label>
              <InlineCombobox
                value={propertyId}
                displayValue={properties.find((p) => p.id === propertyId)?.name ?? ""}
                placeholder="Select property…"
                items={properties}
                getSearchText={(p) => `${p.name} ${p.city ?? ""}`}
                renderItem={(p) => (
                  <span>
                    <span className="font-medium">{p.name}</span>
                    {p.city && <span className="text-muted-foreground ml-1 text-xs">{p.city}</span>}
                  </span>
                )}
                onSelect={(p) => { setPropertyId(p.id); setUserChangedProperty(true); setUnitId(""); setTenant(null) }}
              />
            </div>
            {propertyId && buildings.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Building</Label>
                <FormSelect
                  value={buildingId}
                  onValueChange={setBuildingId}
                  placeholder="All buildings / not specific"
                  options={[{ value: "", label: "All buildings / not specific" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]}
                  className="w-full"
                />
              </div>
            )}
            {propertyId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Unit *</Label>
                <InlineCombobox
                  value={unitId}
                  displayValue={units.find((u) => u.id === unitId)?.unit_number ?? ""}
                  placeholder="Select unit…"
                  items={units}
                  getSearchText={(u) => u.unit_number}
                  renderItem={(u) => <span>{u.unit_number}</span>}
                  onSelect={(u) => { setUnitId(u.id); setUserChangedUnit(true) }}
                  loading={loadingUnits}
                />
                {unitId && (() => {
                  let tenantLine: string
                  if (loadingTenant) { tenantLine = "Loading tenant…" }
                  else if (tenant) { tenantLine = `Tenant: ${tenant.name}${tenant.phone ? ` · ${tenant.phone}` : ""}` }
                  else { tenantLine = "No active tenant on this unit" }
                  return <div className="text-xs text-muted-foreground">{tenantLine}</div>
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderTriagePanel() {
    if ((!triaging && !triageResult) || triageConfirmed) return null
    return (
      <div className={`rounded-xl border px-5 py-4 space-y-3 ${triageResult?.urgency === "emergency" ? "border-danger/40 bg-danger-bg" : "border-brand/20 bg-brand/5"}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">AI classification</p>
          {triaging && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {triageResult && !triaging && (
          <>
            {triageResult.urgency === "emergency" && (
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">EMERGENCY — This appears to be a safety issue. Immediate action recommended.</p>
              </div>
            )}
            {!overriding ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Category:</span> {CATEGORY_LABELS[triageResult.category] ?? triageResult.category}</p>
                <p><span className="text-muted-foreground">Urgency:</span> {URGENCY_LABELS[triageResult.urgency] ?? triageResult.urgency} — {triageResult.urgency_reason}</p>
                <p className="text-xs text-muted-foreground">{triageResult.suggested_action}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <InlineCombobox
                      value={overrideCategory || triageResult.category}
                      displayValue={CATEGORY_LABELS[overrideCategory || triageResult.category] ?? overrideCategory}
                      placeholder="Select category…"
                      items={CATEGORIES.map((c) => ({ id: c, name: CATEGORY_LABELS[c] ?? c, specialities: [] }))}
                      getSearchText={(c) => c.name}
                      renderItem={(c) => <span>{c.name}</span>}
                      onSelect={(c) => setOverrideCategory(c.id)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Urgency</Label>
                    <InlineCombobox
                      value={overrideUrgency || triageResult.urgency}
                      displayValue={URGENCY_LABELS[overrideUrgency || triageResult.urgency] ?? overrideUrgency}
                      placeholder="Select urgency…"
                      items={URGENCIES.map((u) => ({ id: u, name: URGENCY_LABELS[u] ?? u, specialities: [] }))}
                      getSearchText={(u) => u.name}
                      renderItem={(u) => <span>{u.name}</span>}
                      onSelect={(u) => setOverrideUrgency(u.id)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason for override (optional)</Label>
                  <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Tenant has small children, upgrading urgency" className="text-sm" />
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {!overriding ? (
                <>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={handleConfirmTriage}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirm</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOverriding(true); setOverrideCategory(triageResult.category); setOverrideUrgency(triageResult.urgency) }}><Pencil className="h-3 w-3 mr-1" />Override</Button>
                </>
              ) : (
                <>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={handleConfirmOverride}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirm override</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOverriding(false)}>Cancel</Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  function renderAssignmentPanel() {
    if (!triageConfirmed) return null
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Assignment</p>
          <button type="button" onClick={handleResetTriage} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Retriage</button>
        </div>
        <div className="text-sm space-y-0.5">
          <p><span className="text-muted-foreground">Category:</span> {CATEGORY_LABELS[effectiveCategory] ?? effectiveCategory}</p>
          <p><span className="text-muted-foreground">Urgency:</span> {URGENCY_LABELS[effectiveUrgency] ?? effectiveUrgency}</p>
        </div>
        {(() => {
          if (loadingPreferred) {
            return <p className="text-xs text-muted-foreground">Finding preferred contractor…</p>
          }
          if (preferredContractor && !showContractorPicker) {
            return (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{preferredContractor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Preferred for {CATEGORY_LABELS[effectiveCategory] ?? effectiveCategory}{preferredContractor.scope === "property" ? " at this property" : ""}{preferredContractor.phone ? ` · ${preferredContractor.phone}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => setShowContractorPicker(true)} className="text-xs text-brand hover:underline shrink-0">Change</button>
              </div>
            )
          }
          return (
            <div className="space-y-1.5">
              <Label className="text-xs">{preferredContractor ? "Choose different contractor" : "Contractor (optional)"}</Label>
              <InlineCombobox
                value={contractorId}
                displayValue={pickableContractors.find((c) => c.id === contractorId)?.name ?? ""}
                placeholder="No contractor assigned yet"
                items={[{ id: "", name: "No contractor assigned yet", specialities: [] }, ...pickableContractors]}
                getSearchText={(c) => c.name}
                renderItem={(c) => <span>{c.name || "No contractor assigned yet"}</span>}
                onSelect={(c) => setContractorId(c.id)}
              />
              {preferredContractor && (
                <button type="button" onClick={() => { setContractorId(preferredContractor.id); setShowContractorPicker(false) }} className="text-xs text-brand hover:underline">
                  Use {preferredContractor.name}
                </button>
              )}
            </div>
          )
        })()}
        <div className="space-y-1.5">
          <Label className="text-xs">Estimated cost (optional)</Label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-muted-foreground">R</span>
            <Input type="number" min="0" step="0.01" value={estimatedCostInput} onChange={(e) => setEstimatedCostInput(e.target.value)} className="pl-7 text-sm" placeholder="0.00" />
          </div>
          {estimatedCostCents > 0 && (
            <p className={`text-xs ${aboveThreshold ? "text-warning" : "text-success"}`}>
              {aboveThreshold ? `⚠️ Above approval limit (${formatZAR(approvalThresholdCents)}) — landlord will be notified for approval` : `✅ Within approval limit (${formatZAR(approvalThresholdCents)})`}
            </p>
          )}
        </div>
      </div>
    )
  }

  function renderAccessSection() {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Access</p>
        <div className="space-y-1.5">
          <Label className="text-xs">Contact for access</Label>
          {contactOptions.length > 0 && !showCustomContact ? (
            <div className="space-y-2">
              {contactOptions.map((opt) => (
                <label key={opt.role} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="access_contact" checked={selectedContactRole === opt.role} onChange={() => setSelectedContactRole(opt.role)} className="accent-brand" />
                  <span>{opt.label}</span>
                  {opt.phone && <span className="text-muted-foreground text-xs">{opt.phone}</span>}
                </label>
              ))}
              <button type="button" onClick={() => setShowCustomContact(true)} className="text-xs text-brand hover:underline">Other contact</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input value={customContactName} onChange={(e) => setCustomContactName(e.target.value)} placeholder="Contact name" className="text-sm" />
              <Input value={customContactPhone} onChange={(e) => setCustomContactPhone(e.target.value)} placeholder="Phone number" className="text-sm" />
            </div>
          )}
          {showCustomContact && contactOptions.length > 0 && (
            <button type="button" onClick={() => setShowCustomContact(false)} className="text-xs text-brand hover:underline">Use lease contact</button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Access instructions</Label>
          <Textarea value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} rows={2} placeholder="e.g. Key at reception. Tenant works from home — call 30 min before. No power cuts before 10am." className="resize-none text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Special instructions (optional)</Label>
          <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows={2} placeholder="e.g. Noise restrictions after 17:00" className="resize-none text-sm" />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ─── Where ──────────────────────────────────────── */}
      {renderWhereSection()}

      {/* ─── What's the problem ─────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">What&apos;s the problem</p>

        <div className="space-y-1.5">
          <Label className="text-xs">Title *</Label>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (triageConfirmed) handleResetTriage() }}
            placeholder="Brief description — e.g. Lounge light trips circuit breaker"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description *</Label>
          <Textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); if (triageConfirmed) handleResetTriage() }}
            rows={4}
            placeholder="Full details — what's happening, when it started, what's been tried. More detail = better classification."
            required
          />
        </div>
      </div>

      {/* ─── AI classification ──────────────────────────── */}
      {renderTriagePanel()}

      {/* ─── Assignment (appears after triage confirmed) ─── */}
      {renderAssignmentPanel()}

      {/* ─── Access ──────────────────────────────────────── */}
      {renderAccessSection()}

      {/* ─── Submit ──────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="submit"
          disabled={submitting || !unitId || !propertyId || !title.trim() || !description.trim()}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Logging…</>
          ) : (
            "Log request"
          )}
        </Button>
      </div>
    </form>
  )
}
