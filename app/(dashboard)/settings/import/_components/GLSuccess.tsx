"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import type { GLImportResultData } from "./GLReview"

interface GLSuccessProps {
  result: GLImportResultData
  onReset: () => void
}

export function GLSuccess({ result, onReset }: Readonly<GLSuccessProps>) {
  const [showErrors, setShowErrors] = useState(false)
  const hasRecords = result.transactionsCreated > 0 || result.depositsCreated > 0

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${hasRecords ? "bg-green-500/10" : "bg-amber-500/10"}`}>
        {hasRecords ? <CheckCircle2 className="size-8 text-green-500" /> : <AlertTriangle className="size-8 text-amber-500" />}
      </div>

      <h2 className="font-heading text-2xl mb-2">
        {hasRecords ? "GL history imported" : "Import completed with errors"}
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        {result.transactionsCreated} transaction{result.transactionsCreated === 1 ? "" : "s"}
        {result.depositsCreated > 0 && ` · ${result.depositsCreated} deposit record${result.depositsCreated === 1 ? "" : "s"}`}
      </p>

      {result.skipped > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {result.skipped} duplicate{result.skipped === 1 ? "" : "s"} skipped
        </p>
      )}

      {/* Outstanding balances */}
      {result.outstandingBalances.length > 0 && (
        <Card className="mb-6 text-left border-amber-500/20">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-amber-500 mb-2">Outstanding balances</p>
            {result.outstandingBalances.map((ob) => (
              <div key={ob.propertyName} className="flex items-center justify-between text-sm py-1">
                <span>{ob.propertyName}</span>
                <span className="text-danger font-medium">{formatZAR(ob.balance)}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-2">
              Create arrears cases for these tenants from the Payments → Arrears page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <Card className="mb-6 text-left border-amber-500/20">
          <CardContent className="pt-4">
            <button type="button" onClick={() => setShowErrors(!showErrors)} className="flex items-center gap-2 text-sm text-amber-500 w-full">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{result.errors.length} error{result.errors.length === 1 ? "" : "s"}</span>
              {showErrors ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4 ml-auto" />}
            </button>
            {showErrors && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <div key={`err-${i}`} className="text-xs border-b border-border/30 pb-2">
                    <span className="text-foreground">{err.description}:</span>{" "}
                    <span className="text-muted-foreground">{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Button render={<Link href="/dashboard" />}>View dashboard</Button>
        <Button variant="outline" onClick={onReset}>Import another file</Button>
      </div>
    </div>
  )
}
