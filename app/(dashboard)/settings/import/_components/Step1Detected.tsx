"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Building2, FileText, ArrowLeft, ArrowRight, Info } from "lucide-react"
import type { AnalysisResult } from "../page"

interface Step1DetectedProps {
  analysis: AnalysisResult
  onBack: () => void
  onContinue: (typeFilter?: string[], stateFilter?: string[]) => void
}

export function Step1Detected({ analysis, onBack, onContinue }: Readonly<Step1DetectedProps>) {
  // TYPE column filtering (for TPN mixed-entity exports)
  const hasTypeColumn = analysis.columnSuggestions.some(
    (s) => s.field === "__entity_type"
  )
  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>({
    Tenant: true,
    Landlord: false,
    Vendor: false,
    Agent: false,
  })
  const [includeApplicants, setIncludeApplicants] = useState(false)

  const entities = [
    { key: "hasTenant", label: "Tenants", icon: Users, found: analysis.detectedEntities.hasTenant },
    { key: "hasUnit", label: "Units", icon: Building2, found: analysis.detectedEntities.hasUnit },
    { key: "hasLease", label: "Leases", icon: FileText, found: analysis.detectedEntities.hasLease },
  ]

  function handleContinue() {
    if (hasTypeColumn) {
      const selectedTypes = Object.entries(typeFilters)
        .filter(([, v]) => v)
        .map(([k]) => k)
      const states = ["Active"]
      if (includeApplicants) states.push("Applicant")
      onContinue(selectedTypes, states)
    } else {
      onContinue()
    }
  }

  // Fix 6: Better "not found" messaging
  function getNotFoundMessage(key: string): string {
    if (key === "hasLease" && analysis.detectedEntities.hasTenant) {
      return "No lease data — this looks like a contacts export. Import tenants now and add lease details after."
    }
    if (key === "hasUnit" && analysis.detectedEntities.hasTenant) {
      return "No unit data — you can assign units to tenants after import."
    }
    return "Not found"
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">What we found</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {analysis.filename} — {analysis.columnSuggestions.length} columns detected
        {analysis.isTpnFormat && (
          <Badge variant="secondary" className="ml-2 text-xs bg-brand/10 text-brand">
            TPN RentBook export detected
          </Badge>
        )}
      </p>

      {/* Detection cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {entities.map((e) => (
          <Card key={e.key} className={e.found ? "border-brand/30" : "opacity-40"}>
            <CardContent className="py-4 text-center">
              <e.icon className={`size-6 mx-auto mb-2 ${e.found ? "text-brand" : "text-muted-foreground"}`} />
              <p className="text-sm font-medium">{e.label}</p>
              <p className="text-xs text-muted-foreground">
                {e.found ? "Detected" : getNotFoundMessage(e.key)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fix 2: TYPE column entity filtering */}
      {hasTypeColumn && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">This file contains multiple contact types</p>
                <p className="text-xs text-muted-foreground mt-0.5">Only tenants should be imported. Landlords, vendors, and agents are not tenant records.</p>
              </div>
            </div>
            <div className="space-y-2 pl-6">
              {Object.entries(typeFilters).map(([type, checked]) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setTypeFilters({ ...typeFilters, [type]: e.target.checked })}
                    className="accent-brand"
                  />
                  <span className={`text-sm ${type !== "Tenant" && checked ? "text-amber-500" : ""}`}>
                    {type}s
                    {type !== "Tenant" && checked && <span className="text-xs ml-1">(not recommended)</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="pl-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeApplicants}
                  onChange={(e) => setIncludeApplicants(e.target.checked)}
                  className="accent-brand"
                />
                Also import Applicants (STATE = &apos;Applicant&apos;)
              </label>
              <p className="text-xs text-muted-foreground mt-1">Inactive contacts are always skipped.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Column chips */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">Columns in your file:</p>
        <div className="flex flex-wrap gap-1.5">
          {analysis.columnSuggestions.map((s) => {
            function getChipColor() {
              if (s.entity === "tenant") return "bg-blue-500/10 text-blue-400"
              if (s.entity === "unit") return "bg-green-500/10 text-green-400"
              if (s.entity === "lease") return "bg-purple-500/10 text-purple-400"
              if (s.entity === "bank") return "bg-amber-500/10 text-amber-400"
              if (s.entity === "filter") return "bg-red-500/10 text-red-400"
              return "bg-surface-elevated text-muted-foreground"
            }
            return (
              <Badge key={s.column} variant="secondary" className={`text-xs ${getChipColor()}`}>
                {s.column}
                {s.field && <span className="ml-1 opacity-60">→ {s.field}</span>}
              </Badge>
            )
          })}
        </div>
      </div>

      {analysis.unmappedColumns.length > 0 && (
        <p className="text-xs text-amber-500 mb-4">
          {analysis.unmappedColumns.length} column{analysis.unmappedColumns.length > 1 ? "s" : ""} not auto-mapped — you can assign them in the next step.
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" /> Upload different file
        </Button>
        <Button onClick={handleContinue} className="flex-1">
          Map columns <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
