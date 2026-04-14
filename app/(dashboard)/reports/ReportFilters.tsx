"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ReportPeriodType } from "@/lib/reports/types"

interface Person {
  id: string
  name: string
}

interface ReportFiltersProps {
  properties: Person[]
  landlords: Person[]
  agents: Person[]
  tier: string
  onApply: (filters: {
    periodType: ReportPeriodType
    propertyIds: string[]
    customFrom?: string
    customTo?: string
    landlordId?: string
    agentId?: string
    showInactive?: boolean
  }) => void
}

const PERIOD_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: "this_month",    label: "This month" },
  { value: "last_month",    label: "Last month" },
  { value: "this_quarter",  label: "This quarter" },
  { value: "last_quarter",  label: "Last quarter" },
  { value: "this_tax_year", label: "This tax year" },
  { value: "last_tax_year", label: "Last tax year" },
  { value: "custom",        label: "Custom range" },
]

const STEWARD_TIERS = new Set(["steward", "portfolio", "firm"])
const PORTFOLIO_TIERS = new Set(["portfolio", "firm"])

export function ReportFilters({ properties, landlords, agents, tier, onApply }: Readonly<ReportFiltersProps>) {
  const [periodType, setPeriodType] = useState<ReportPeriodType>("this_month")
  const [selectedProperty, setSelectedProperty] = useState("all")
  const [selectedLandlord, setSelectedLandlord] = useState("all")
  const [selectedAgent, setSelectedAgent] = useState("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  function handleApply() {
    const propertyIds = selectedProperty === "all" ? [] : [selectedProperty]
    onApply({
      periodType,
      propertyIds,
      customFrom: periodType === "custom" ? customFrom : undefined,
      customTo: periodType === "custom" ? customTo : undefined,
      landlordId: selectedLandlord === "all" ? undefined : selectedLandlord,
      agentId: selectedAgent === "all" ? undefined : selectedAgent,
      showInactive,
    })
  }

  const showLandlord = STEWARD_TIERS.has(tier)
  const showAgent = PORTFOLIO_TIERS.has(tier)

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Period</Label>
        <Select value={periodType} onValueChange={(v) => setPeriodType((v ?? "this_month") as ReportPeriodType)}>
          <SelectTrigger className="w-[160px] h-9">
            <span>{PERIOD_OPTIONS.find((o) => o.value === periodType)?.label ?? "Select period"}</span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
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
            <span>{selectedProperty === "all" ? "All properties" : properties.find((p) => p.id === selectedProperty)?.name ?? "Select"}</span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showLandlord && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Landlord</Label>
          <Select value={selectedLandlord} onValueChange={(v) => setSelectedLandlord(v ?? "all")}>
            <SelectTrigger className="w-[180px] h-9">
              <span>{selectedLandlord === "all" ? "All landlords" : landlords.find((l) => l.id === selectedLandlord)?.name ?? "Select"}</span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">All landlords</SelectItem>
              {landlords.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showAgent && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Agent / PM</Label>
          <Select value={selectedAgent} onValueChange={(v) => setSelectedAgent(v ?? "all")}>
            <SelectTrigger className="w-[180px] h-9">
              <span>{selectedAgent === "all" ? "All agents" : agents.find((a) => a.id === selectedAgent)?.name ?? "Select"}</span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2 pb-0.5">
        <input
          id="show-inactive"
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-brand"
        />
        <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer">Show inactive</Label>
      </div>

      <Button size="sm" onClick={handleApply}>Apply</Button>
    </div>
  )
}
