"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Building2, FileText, ArrowLeft, ArrowRight, Info, Wrench, UserCheck } from "lucide-react"
import type { AnalysisResult } from "../page"

interface Step1DetectedProps {
  analysis: AnalysisResult
  onBack: () => void
  onContinue: () => void
}

export function Step1Detected({ analysis, onBack, onContinue }: Readonly<Step1DetectedProps>) {
  const hasTypeColumn = analysis.columnSuggestions.some(
    (s) => s.field === "__entity_type"
  )

  const entities = [
    { key: "hasTenant", label: "Tenants", icon: Users, found: analysis.detectedEntities.hasTenant },
    { key: "hasUnit", label: "Units", icon: Building2, found: analysis.detectedEntities.hasUnit },
    { key: "hasLease", label: "Leases", icon: FileText, found: analysis.detectedEntities.hasLease },
  ]

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

      {/* Mixed entity type info — routing is automatic */}
      {hasTypeColumn && (
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Multiple contact types detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each contact type will be imported to the correct location automatically:
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-6 text-xs">
              <div className="flex items-center gap-1.5">
                <Users className="size-3 text-blue-400" />
                <span>Tenants → tenant records</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wrench className="size-3 text-green-400" />
                <span>Vendors → contractor records</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 className="size-3 text-purple-400" />
                <span>Landlords → link to properties</span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCheck className="size-3 text-amber-400" />
                <span>Agents → team invites</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Inactive contacts are skipped automatically.
            </p>
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
        <Button onClick={onContinue} className="flex-1">
          Map columns <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
