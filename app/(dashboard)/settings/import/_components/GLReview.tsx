"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2 } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import type { GLPropertyBlock } from "@/lib/import/parseGLReport"

interface GLReviewProps {
  blocks: GLPropertyBlock[]
  leaseMatches: Record<string, string>
  propertyMatches: Record<string, string>
  onBack: () => void
  onImportComplete: (result: GLImportResultData) => void
}

export interface GLImportResultData {
  transactionsCreated: number
  depositsCreated: number
  skipped: number
  errors: Array<{ description: string; message: string }>
  outstandingBalances: Array<{ propertyName: string; balance: number }>
}

export function GLReview({ blocks, leaseMatches, propertyMatches, onBack, onImportComplete }: Readonly<GLReviewProps>) {
  const [importDeposits, setImportDeposits] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalTxns = blocks.reduce((sum, b) => sum + b.arTransactions.length, 0)
  const totalDeposits = blocks.reduce((sum, b) => sum + (b.depositTransactions?.length ?? 0), 0)

  // Determine date range from data
  const allDates = blocks.flatMap((b) => b.arTransactions.map((t) => t.date))
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : new Date()
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date()

  async function handleImport() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/import/gl-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: blocks.map((b) => ({
            ...b,
            periodFrom: b.periodFrom.toISOString(),
            periodTo: b.periodTo.toISOString(),
            arTransactions: b.arTransactions.map((t) => ({
              ...t,
              date: t.date.toISOString(),
            })),
            depositTransactions: (b.depositTransactions ?? []).map((t) => ({
              ...t,
              date: t.date.toISOString(),
            })),
          })),
          leaseMatches,
          propertyMatches,
          dateFilter: {
            from: minDate.toISOString().slice(0, 10),
            to: maxDate.toISOString().slice(0, 10),
          },
          importDeposits,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error || "GL import failed")
        setLoading(false)
        return
      }

      const result = await res.json()
      onImportComplete(result)
    } catch {
      setError("GL import failed. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">Review GL import</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Period: {minDate.toLocaleDateString("en-ZA")} — {maxDate.toLocaleDateString("en-ZA")}
      </p>

      {/* Transaction preview per property */}
      <div className="space-y-3 mb-6">
        {blocks.map((block) => {
          const key = `${block.propertyName}(${block.ownerName})`
          const matched = block.unitRefs.some((ref) => leaseMatches[ref]) || !!propertyMatches[key]
          return (
            <Card key={key}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{block.propertyName}</p>
                    <p className="text-xs text-muted-foreground">{block.ownerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs">{block.arTransactions.length} transactions</p>
                    {matched ? (
                      <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-400">Matched</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400">Unmatched</Badge>
                    )}
                  </div>
                </div>
                {block.closingBalance > 0 && (
                  <p className="text-xs text-danger mt-1">Outstanding: {formatZAR(block.closingBalance)}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Deposit opt-in */}
      {totalDeposits > 0 && (
        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={importDeposits}
            onChange={(e) => setImportDeposits(e.target.checked)}
            className="accent-brand"
          />
          <span className="text-sm">Also import deposit history ({totalDeposits} entries)</span>
        </label>
      )}

      <div className="text-sm text-muted-foreground mb-4 space-y-1">
        <p>{totalTxns} rent transactions to import</p>
        {importDeposits && totalDeposits > 0 && <p>{totalDeposits} deposit transactions to import</p>}
        <p>All records marked as historical (opening balances)</p>
      </div>

      <p className="text-xs text-muted-foreground mb-6">
        Duplicate transactions (same lease, same amount, within 3 days) will be automatically skipped.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">{error}</div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Button onClick={handleImport} className="flex-1" disabled={loading}>
          {loading ? (
            <><Loader2 className="size-4 mr-2 animate-spin" /> Importing...</>
          ) : (
            "Import GL history"
          )}
        </Button>
      </div>
    </div>
  )
}
