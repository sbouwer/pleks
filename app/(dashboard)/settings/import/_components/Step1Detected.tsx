"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Building2, FileText, ArrowLeft, ArrowRight } from "lucide-react"
import type { AnalysisResult } from "../page"

interface Step1DetectedProps {
  analysis: AnalysisResult
  onBack: () => void
  onContinue: () => void
}

export function Step1Detected({ analysis, onBack, onContinue }: Readonly<Step1DetectedProps>) {
  const entities = [
    { key: "hasTenant", label: "Tenants", icon: Users, found: analysis.detectedEntities.hasTenant },
    { key: "hasUnit", label: "Units", icon: Building2, found: analysis.detectedEntities.hasUnit },
    { key: "hasLease", label: "Leases", icon: FileText, found: analysis.detectedEntities.hasLease },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">What we found</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {analysis.filename} — {analysis.columnSuggestions.length} columns detected
        {analysis.isTpnFormat && <Badge variant="secondary" className="ml-2 text-xs">TPN format</Badge>}
      </p>

      {/* Detection cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {entities.map((e) => (
          <Card key={e.key} className={e.found ? "border-brand/30" : "opacity-40"}>
            <CardContent className="py-4 text-center">
              <e.icon className={`size-6 mx-auto mb-2 ${e.found ? "text-brand" : "text-muted-foreground"}`} />
              <p className="text-sm font-medium">{e.label}</p>
              <p className="text-xs text-muted-foreground">{e.found ? "Detected" : "Not found"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Column chips */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-2">Columns in your file:</p>
        <div className="flex flex-wrap gap-1.5">
          {analysis.columnSuggestions.map((s) => (
            <Badge
              key={s.column}
              variant="secondary"
              className={`text-xs ${
                s.entity === "tenant" ? "bg-blue-500/10 text-blue-400"
                  : s.entity === "unit" ? "bg-green-500/10 text-green-400"
                  : s.entity === "lease" ? "bg-purple-500/10 text-purple-400"
                  : "bg-surface-elevated text-muted-foreground"
              }`}
            >
              {s.column}
              {s.field && <span className="ml-1 opacity-60">→ {s.field}</span>}
            </Badge>
          ))}
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
