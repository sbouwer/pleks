"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import type { AnalysisResult, ImportDecisions, ImportResultData } from "../page"

interface Step4Props {
  analysis: AnalysisResult
  rows: Record<string, string>[]
  decisions: ImportDecisions
  onBack: () => void
  onImportComplete: (result: ImportResultData) => void
}

export function Step4Confirm({ analysis, rows, decisions, onBack, onImportComplete }: Readonly<Step4Props>) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mappedCount = Object.keys(decisions.columnMapping).length
  const extraCount = Object.keys(decisions.extraColumnRouting).length

  async function handleImport() {
    setLoading(true)
    setProgress("Importing...")
    setError(null)

    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          decisions,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error || "Import failed")
        setLoading(false)
        return
      }

      const result = await res.json()
      onImportComplete({
        created: result.created,
        skipped: result.skipped,
        errors: result.errors ?? [],
      })
    } catch {
      setError("Import failed. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-heading text-2xl mb-2">Ready to import</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Review the summary below and confirm.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {analysis.detectedEntities.hasTenant && (
          <Card>
            <CardContent className="py-4 text-center">
              <p className="font-heading text-2xl">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Tenant rows</p>
            </CardContent>
          </Card>
        )}
        {analysis.detectedEntities.hasUnit && (
          <Card>
            <CardContent className="py-4 text-center">
              <p className="font-heading text-2xl">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Unit rows</p>
            </CardContent>
          </Card>
        )}
        {analysis.detectedEntities.hasLease && (
          <Card>
            <CardContent className="py-4 text-center">
              <p className="font-heading text-2xl">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Lease rows</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-2 mb-6 text-sm text-muted-foreground">
        <p>{mappedCount} columns mapped to Pleks fields</p>
        {extraCount > 0 && <p>{extraCount} extra columns routed</p>}
        {decisions.expiredLeaseAction === "skip" && (
          <p>Expired leases will be skipped</p>
        )}
        {decisions.expiredLeaseAction === "import_as_expired" && (
          <p>Expired leases will be imported with &apos;expired&apos; status</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-6">
        This cannot be undone. Records will be created in your account immediately.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Button onClick={handleImport} className="flex-1" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {progress}
            </>
          ) : (
            "Import now"
          )}
        </Button>
      </div>
    </div>
  )
}
