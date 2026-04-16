"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { FormSelect } from "@/components/ui/FormSelect"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"
import { Loader2, ChevronDown, ChevronUp, Plus } from "lucide-react"

interface LevySchedule {
  id: string
  description: string
  schedule_type: string
  calculation_method: string
  total_budget_cents: number
  effective_from: string
  effective_to: string | null
  is_active: boolean
  include_vacant_units: boolean
}

interface UnitAmount {
  owner_id: string
  unit_id: string
  percentage?: number
  fixed_cents?: number
  calculated_cents: number
  basis_pq?: number
  basis_m2?: number
}

interface CalcResult {
  results: UnitAmount[]
  totalCalculated: number
  budgetTarget: number
  validationWarning: string | null
  needsValidation: boolean
}

interface Props {
  hoaId: string
  initialSchedules: LevySchedule[]
  unitOwnerMap: Record<string, string> // unit_id → unit_number
}

const SCHEDULE_TYPES = [
  { value: "admin_levy", label: "Admin Levy" },
  { value: "reserve_levy", label: "Reserve Levy" },
  { value: "special_levy", label: "Special Levy" },
  { value: "utility_recovery", label: "Utility Recovery" },
]

const CALC_METHODS = [
  { value: "participation_quota", label: "Participation Quota" },
  { value: "floor_area_m2", label: "Floor Area (m²)" },
  { value: "equal_split", label: "Equal Split" },
  { value: "fixed_amount", label: "Fixed Amount per Unit" },
  { value: "percentage_of_budget", label: "Percentage of Budget" },
]

export function LevyScheduleManager({ hoaId, initialSchedules, unitOwnerMap }: Props) {
  const [schedules, setSchedules] = useState<LevySchedule[]>(initialSchedules)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calcLoading, setCalcLoading] = useState<string | null>(null)
  const [calcResults, setCalcResults] = useState<Record<string, CalcResult>>({})
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({})

  // Form state
  const [form, setForm] = useState({
    description: "",
    schedule_type: "admin_levy",
    calculation_method: "participation_quota",
    total_budget_rands: "",
    effective_from: new Date().toISOString().split("T")[0],
    include_vacant_units: true,
  })

  async function handleCreate() {
    if (!form.description.trim() || !form.total_budget_rands || !form.effective_from) {
      toast.error("Fill in all required fields")
      return
    }
    const cents = Math.round(parseFloat(form.total_budget_rands) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error("Enter a valid budget amount")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/hoa/${hoaId}/levy-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim(),
          schedule_type: form.schedule_type,
          calculation_method: form.calculation_method,
          total_budget_cents: cents,
          effective_from: form.effective_from,
          include_vacant_units: form.include_vacant_units,
        }),
      })
      const data = await res.json() as LevySchedule & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create schedule")
        return
      }
      setSchedules((prev) => [data, ...prev])
      setShowForm(false)
      setForm({
        description: "",
        schedule_type: "admin_levy",
        calculation_method: "participation_quota",
        total_budget_rands: "",
        effective_from: new Date().toISOString().split("T")[0],
        include_vacant_units: true,
      })
      toast.success("Schedule created")
    } finally {
      setSaving(false)
    }
  }

  async function handleCalculate(scheduleId: string) {
    setCalcLoading(scheduleId)
    try {
      const res = await fetch(`/api/hoa/${hoaId}/levy-schedules/${scheduleId}/calculate`, {
        method: "POST",
      })
      const data = await res.json() as CalcResult & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Calculation failed")
        return
      }
      setCalcResults((prev) => ({ ...prev, [scheduleId]: data }))
      setExpandedResults((prev) => ({ ...prev, [scheduleId]: true }))
      if (data.validationWarning) {
        toast.warning(data.validationWarning)
      } else {
        toast.success("Levy amounts calculated")
      }
    } finally {
      setCalcLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm">Levy Schedules</h3>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-3.5 mr-1.5" />
          New schedule
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">New Levy Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
                <Input
                  placeholder="e.g. Admin levy 2026/27"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type *</label>
                <FormSelect
                  value={form.schedule_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, schedule_type: v }))}
                  options={SCHEDULE_TYPES}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Calculation method *</label>
                <FormSelect
                  value={form.calculation_method}
                  onValueChange={(v) => setForm((f) => ({ ...f, calculation_method: v }))}
                  options={CALC_METHODS}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Monthly budget (R) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={form.total_budget_rands}
                  onChange={(e) => setForm((f) => ({ ...f, total_budget_rands: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Effective from *</label>
                <DatePickerInput
                  value={form.effective_from}
                  onChange={(v) => setForm((f) => ({ ...f, effective_from: v }))}
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include_vacant"
                  checked={form.include_vacant_units}
                  onChange={(e) => setForm((f) => ({ ...f, include_vacant_units: e.target.checked }))}
                  className="size-4"
                />
                <label htmlFor="include_vacant" className="text-sm">
                  Include vacant units in equal split calculations
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving…</> : "Create schedule"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule list */}
      {schedules.length === 0 && !showForm ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No levy schedules configured.</p>
            <p className="text-xs text-muted-foreground mt-1">Create one to start calculating levy amounts per unit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const result = calcResults[s.id]
            const isExpanded = expandedResults[s.id]
            const isCalcing = calcLoading === s.id

            return (
              <Card key={s.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{s.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {SCHEDULE_TYPES.find((t) => t.value === s.schedule_type)?.label ?? s.schedule_type}
                        {" — "}
                        {CALC_METHODS.find((m) => m.value === s.calculation_method)?.label ?? s.calculation_method}
                        {" — "}
                        Budget: {formatZAR(s.total_budget_cents)}/mo
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From: {formatDateShort(new Date(s.effective_from))}
                        {s.effective_to ? ` to ${formatDateShort(new Date(s.effective_to))}` : " (ongoing)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCalculate(s.id)}
                        disabled={isCalcing}
                      >
                        {isCalcing
                          ? <><Loader2 className="size-3 mr-1.5 animate-spin" />Calculating…</>
                          : "Calculate"}
                      </Button>
                      {result && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedResults((prev) => ({ ...prev, [s.id]: !isExpanded }))}
                        >
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Calculation results */}
                  {result && isExpanded && (
                    <div className="mt-4 space-y-2">
                      {result.validationWarning && (
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                          <p className="text-xs text-amber-700 dark:text-amber-400">{result.validationWarning}</p>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-1.5 pr-2">Unit</th>
                              <th className="text-right py-1.5 px-2">Share</th>
                              {s.calculation_method === "floor_area_m2" && (
                                <th className="text-right py-1.5 px-2">m²</th>
                              )}
                              <th className="text-right py-1.5">Amount/mo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.results.map((r) => (
                              <tr key={r.unit_id} className="border-b border-border/40">
                                <td className="py-1.5 pr-2">
                                  {unitOwnerMap[r.unit_id] ? `Unit ${unitOwnerMap[r.unit_id]}` : r.unit_id.slice(0, 8)}
                                </td>
                                <td className="text-right py-1.5 px-2">
                                  {r.percentage != null ? `${r.percentage.toFixed(2)}%` : "—"}
                                </td>
                                {s.calculation_method === "floor_area_m2" && (
                                  <td className="text-right py-1.5 px-2">
                                    {r.basis_m2 != null ? `${r.basis_m2} m²` : "—"}
                                  </td>
                                )}
                                <td className="text-right py-1.5 font-medium">
                                  {formatZAR(r.calculated_cents)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="font-semibold">
                              <td className="pt-2 pr-2">Total</td>
                              <td className="text-right pt-2 px-2">100%</td>
                              {s.calculation_method === "floor_area_m2" && <td />}
                              <td className="text-right pt-2">{formatZAR(result.totalCalculated)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
