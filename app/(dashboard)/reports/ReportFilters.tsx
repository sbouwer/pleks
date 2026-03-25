"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ReportPeriodType } from "@/lib/reports/types"

interface Property {
  id: string
  name: string
}

interface ReportFiltersProps {
  properties: Property[]
  onApply: (filters: { periodType: ReportPeriodType; propertyIds: string[]; customFrom?: string; customTo?: string }) => void
}

const PERIOD_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_tax_year", label: "This tax year" },
  { value: "last_tax_year", label: "Last tax year" },
  { value: "custom", label: "Custom range" },
]

export function ReportFilters({ properties, onApply }: ReportFiltersProps) {
  const [periodType, setPeriodType] = useState<ReportPeriodType>("this_month")
  const [selectedProperty, setSelectedProperty] = useState<string>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  function handleApply() {
    const propertyIds = selectedProperty === "all" ? [] : [selectedProperty]
    onApply({
      periodType,
      propertyIds,
      customFrom: periodType === "custom" ? customFrom : undefined,
      customTo: periodType === "custom" ? customTo : undefined,
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Period</Label>
        <Select value={periodType} onValueChange={(v) => setPeriodType(v as ReportPeriodType)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {periodType === "custom" && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px] h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px] h-9" />
          </div>
        </>
      )}

      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Property</Label>
        <Select value={selectedProperty} onValueChange={(v) => setSelectedProperty(v ?? "all")}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" onClick={handleApply}>Apply</Button>
    </div>
  )
}
