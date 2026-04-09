"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBuilding, updateBuilding } from "@/lib/actions/buildings"

const BUILDING_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed_use", label: "Mixed use" },
  { value: "industrial", label: "Industrial" },
  { value: "heritage", label: "Heritage" },
  { value: "heritage_commercial", label: "Heritage commercial" },
  { value: "heritage_residential", label: "Heritage residential" },
]

const HERITAGE_STATUSES = [
  { value: "none", label: "None" },
  { value: "grade_1", label: "Grade I — SAHRA (national)" },
  { value: "grade_2", label: "Grade II — SAHRA" },
  { value: "grade_3a", label: "Grade IIIa — Provincial (significant)" },
  { value: "grade_3b", label: "Grade IIIb — Provincial (contextual)" },
  { value: "local_significance", label: "Local authority listing" },
]

const MAINTENANCE_RHYTHMS = [
  { value: "standard", label: "Standard" },
  { value: "heritage", label: "Heritage — specialist contractors, pre-approval, longer SLAs" },
  { value: "new_build", label: "New build — builder warranty period" },
  { value: "industrial", label: "Industrial — plant and equipment" },
  { value: "custom", label: "Custom" },
]

const INSURANCE_TYPES = [
  { value: "standard_buildings", label: "Standard buildings" },
  { value: "heritage_specialist", label: "Heritage specialist" },
  { value: "commercial_property", label: "Commercial property" },
  { value: "sectional_title", label: "Sectional title" },
  { value: "other", label: "Other" },
]

export interface BuildingData {
  id?: string
  name?: string
  building_code?: string | null
  building_type?: string
  construction_year?: number | null
  floors_above_ground?: number | null
  total_floor_area_m2?: number | null
  heritage_status?: string | null
  heritage_reference?: string | null
  maintenance_rhythm?: string
  heritage_pre_approval_required?: boolean
  heritage_materials_spec?: string | null
  heritage_approved_contractors_only?: boolean
  insurance_policy_number?: string | null
  insurance_provider?: string | null
  insurance_type?: string | null
  insurance_renewal_date?: string | null
  insurance_replacement_value_cents?: number | null
  description?: string | null
  notes?: string | null
}

interface Props {
  propertyId: string
  building?: BuildingData
}

export function BuildingForm({ propertyId, building }: Readonly<Props>) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)
  const [buildingType, setBuildingType] = useState(building?.building_type ?? "residential")
  const [maintenanceRhythm, setMaintenanceRhythm] = useState(building?.maintenance_rhythm ?? "standard")
  const [heritageStatus, setHeritageStatus] = useState(building?.heritage_status ?? "none")
  const [insuranceType, setInsuranceType] = useState(building?.insurance_type ?? "")
  const [preApproval, setPreApproval] = useState(building?.heritage_pre_approval_required ?? false)
  const [approvedContractorsOnly, setApprovedContractorsOnly] = useState(
    building?.heritage_approved_contractors_only ?? false
  )

  const isHeritage = buildingType.startsWith("heritage")
  const isEditing = !!building?.id

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    // Inject select values not captured by native form
    formData.set("building_type", buildingType)
    formData.set("maintenance_rhythm", maintenanceRhythm)
    formData.set("heritage_status", heritageStatus)
    formData.set("insurance_type", insuranceType)
    formData.set("heritage_pre_approval_required", String(preApproval))
    formData.set("heritage_approved_contractors_only", String(approvedContractorsOnly))

    const action = isEditing ? updateBuilding : createBuilding
    const result = await action(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
    // On success, action redirects
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
      <input type="hidden" name="property_id" value={propertyId} />
      {isEditing && <input type="hidden" name="building_id" value={building.id} />}

      {/* Basic details */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Building details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Building name *</Label>
            <Input id="name" name="name" required defaultValue={building?.name} placeholder="e.g. Heritage Wing" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="building_code">Short code</Label>
            <Input id="building_code" name="building_code" defaultValue={building?.building_code ?? ""} placeholder="e.g. HERITAGE" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Building type *</Label>
          <Select value={buildingType} onValueChange={(v) => { if (v) setBuildingType(v) }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUILDING_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="construction_year">Construction year</Label>
            <Input id="construction_year" name="construction_year" type="number" min="1800" max="2100"
              defaultValue={building?.construction_year ?? ""} placeholder="e.g. 1935" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="floors_above_ground">Floors above ground</Label>
            <Input id="floors_above_ground" name="floors_above_ground" type="number" min="1"
              defaultValue={building?.floors_above_ground ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total_floor_area_m2">Total floor area (m²)</Label>
            <Input id="total_floor_area_m2" name="total_floor_area_m2" type="number" min="0" step="0.01"
              defaultValue={building?.total_floor_area_m2 ?? ""} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={building?.description ?? ""} />
        </div>
      </section>

      {/* Heritage section — shown when type is heritage */}
      {isHeritage && (
        <section className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Heritage details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Heritage status</Label>
              <Select value={heritageStatus} onValueChange={(v) => { if (v) setHeritageStatus(v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HERITAGE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heritage_reference">SAHRA / authority reference</Label>
              <Input id="heritage_reference" name="heritage_reference" defaultValue={building?.heritage_reference ?? ""} placeholder="e.g. CPT-2025-00142" />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-brand"
                checked={preApproval}
                onChange={(e) => setPreApproval(e.target.checked)}
              />
              <div>
                <p className="text-sm font-medium">Pre-approval required before structural/facade work</p>
                <p className="text-xs text-muted-foreground">Heritage authority or HOA sign-off required before any structural work is dispatched.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-brand"
                checked={approvedContractorsOnly}
                onChange={(e) => setApprovedContractorsOnly(e.target.checked)}
              />
              <div>
                <p className="text-sm font-medium">Approved contractors only</p>
                <p className="text-xs text-muted-foreground">Only contractors tagged as heritage-approved may work on this building.</p>
              </div>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="heritage_materials_spec">Materials specification</Label>
            <Textarea
              id="heritage_materials_spec"
              name="heritage_materials_spec"
              rows={3}
              defaultValue={building?.heritage_materials_spec ?? ""}
              placeholder="e.g. Lime mortar only — no cement. Sandstone replacements from approved quarry."
            />
          </div>
        </section>
      )}

      {/* Maintenance rhythm */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Maintenance rhythm</h2>
        <div className="space-y-1.5">
          <Select value={maintenanceRhythm} onValueChange={(v) => { if (v) setMaintenanceRhythm(v) }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAINTENANCE_RHYTHMS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets default SLA thresholds for maintenance requests logged against this building.
          </p>
        </div>
      </section>

      {/* Insurance */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insurance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="insurance_policy_number">Policy number</Label>
            <Input id="insurance_policy_number" name="insurance_policy_number" defaultValue={building?.insurance_policy_number ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insurance_provider">Provider</Label>
            <Input id="insurance_provider" name="insurance_provider" defaultValue={building?.insurance_provider ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Insurance type</Label>
            <Select value={insuranceType} onValueChange={(v) => setInsuranceType(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {INSURANCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insurance_renewal_date">Renewal date</Label>
            <Input id="insurance_renewal_date" name="insurance_renewal_date" type="date"
              defaultValue={building?.insurance_renewal_date ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insurance_replacement_value">Replacement value (R)</Label>
            <Input id="insurance_replacement_value" name="insurance_replacement_value" type="number" min="0"
              defaultValue={building?.insurance_replacement_value_cents
                ? (building.insurance_replacement_value_cents / 100).toFixed(0)
                : ""
              }
            />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-1.5">
        <Label htmlFor="notes">Internal notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={building?.notes ?? ""} />
      </section>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {(() => {
            if (loading) return "Saving…"
            if (isEditing) return "Save changes"
            return "Add building"
          })()}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(`/properties/${propertyId}`)} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
