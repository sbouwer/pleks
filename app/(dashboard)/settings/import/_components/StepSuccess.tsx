"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import type { ImportResultData } from "../page"

interface StepSuccessProps {
  result: ImportResultData
  onReset: () => void
}

export function StepSuccess({ result, onReset }: Readonly<StepSuccessProps>) {
  const [showErrors, setShowErrors] = useState(false)
  const hasRecords = result.created.tenants > 0 || result.created.units > 0 || result.created.leases > 0
  const hasErrors = result.errors.length > 0

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${hasRecords ? "bg-green-500/10" : "bg-amber-500/10"}`}>
        {hasRecords ? (
          <CheckCircle2 className="size-8 text-green-500" />
        ) : (
          <AlertTriangle className="size-8 text-amber-500" />
        )}
      </div>

      <h2 className="font-heading text-2xl mb-2">
        {hasRecords ? "Portfolio imported" : "Import completed with errors"}
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        {result.created.tenants} tenant{result.created.tenants !== 1 ? "s" : ""} · {result.created.units} unit{result.created.units !== 1 ? "s" : ""} · {result.created.leases} lease{result.created.leases !== 1 ? "s" : ""}
      </p>

      {result.skipped > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped
        </p>
      )}

      {/* Error log */}
      {hasErrors && (
        <Card className="mb-6 text-left border-amber-500/20">
          <CardContent className="pt-4">
            <button
              type="button"
              onClick={() => setShowErrors(!showErrors)}
              className="flex items-center gap-2 text-sm text-amber-500 w-full"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span>{result.errors.length} row{result.errors.length !== 1 ? "s" : ""} had errors</span>
              {showErrors ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
            </button>
            {showErrors && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <div key={`err-${i}`} className="text-xs border-b border-border/30 pb-2">
                    <span className="text-muted-foreground">Row {err.row ?? i + 1}:</span>{" "}
                    <span className="text-foreground">{err.error ?? err.message ?? JSON.stringify(err)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Button render={<Link href="/dashboard" />}>
          View dashboard
        </Button>
        <Button variant="outline" onClick={onReset}>
          Import another file
        </Button>
      </div>
    </div>
  )
}
