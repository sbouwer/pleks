"use client"

/**
 * app/(dashboard)/settings/import/_components/Step4Confirm.tsx — Final confirmation step: review import summary and execute
 *
 * Route:  /settings/import (step 4 of tenant/lease import wizard)
 * Auth:   gateway (dashboard layout)
 * Data:   analysis + rows + decisions passed as props; POSTs to /api/import/execute
 */
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
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
  // Fail-closed by default: nothing is posted to the trust ledger unless the agent says the agency holds it.
  const [depositsHeld, setDepositsHeld] = useState(decisions.depositsHeldAttested)

  const hasDeposits = Object.values(decisions.columnMapping).some((m) => m.field === "deposit_amount_cents")

  const mappedCount = Object.keys(decisions.columnMapping).length
  const extraCount = Object.keys(decisions.extraColumnRouting).length

  // Detect mixed batch (has __entity_type routing column)
  const entityTypeCol = analysis.columnSuggestions.find((s) => s.field === "__entity_type")?.column
  const isMixedBatch = !!entityTypeCol

  // For mixed batches, count rows per entity type from the actual data
  const mixedCounts = isMixedBatch
    ? rows.reduce<Record<string, number>>((acc, row) => {
        const type = (row[entityTypeCol!] ?? "unknown").toLowerCase().trim()
        acc[type] = (acc[type] ?? 0) + 1
        return acc
      }, {})
    : null

  const MIXED_LABELS: Record<string, string> = {
    tenant: "Tenants",
    vendor: "Contractors",
    contractor: "Contractors",
    landlord: "Landlords",
    owner: "Landlords",
    agent: "Agents",
    inactive: "Inactive (skipped)",
  }

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
          // The cutover attestation is taken HERE, on the confirm screen, so send the decisions with it —
          // not the stale copy from the wizard's state.
          decisions: { ...decisions, depositsHeldAttested: hasDeposits && depositsHeld },
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
      {isMixedBatch && mixedCounts ? (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {Object.entries(mixedCounts).map(([type, count]) => (
            <Card key={type}>
              <CardContent className="py-4 text-center">
                <p className="font-heading text-2xl">{count}</p>
                <p className="text-xs text-muted-foreground">{MIXED_LABELS[type] ?? type}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {analysis.detectedEntities.hasTenant && (
            <Card>
              <CardContent className="py-4 text-center">
                <p className="font-heading text-2xl">{analysis.rowCounts.tenant || rows.length}</p>
                <p className="text-xs text-muted-foreground">Tenants</p>
              </CardContent>
            </Card>
          )}
          {analysis.detectedEntities.hasUnit && (
            <Card>
              <CardContent className="py-4 text-center">
                <p className="font-heading text-2xl">{analysis.rowCounts.unit || rows.length}</p>
                <p className="text-xs text-muted-foreground">Units</p>
              </CardContent>
            </Card>
          )}
          {analysis.detectedEntities.hasLease && (
            <Card>
              <CardContent className="py-4 text-center">
                <p className="font-heading text-2xl">{analysis.rowCounts.lease || rows.length}</p>
                <p className="text-xs text-muted-foreground">Leases</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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

      {/* CUTOVER ATTESTATION. A migrating agency is already HOLDING its tenants' deposits, so that money
          belongs in the deposit/trust sub-ledger as an opening balance — without it, a move-out reconciliation
          has no principal and the trust ledger under-states what the agency holds. But posting into a trust
          ledger asserts a bank reality Pleks cannot see. So it is opt-IN and fail-closed: unticked, the deposit
          amount is still recorded on each lease and nothing is posted. A trust ledger that silently disagrees
          with the bank is worse than an empty one. */}
      {hasDeposits && (
        <Card className="mb-6 text-left border-amber-500/20">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Deposits in this file</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your file carries deposit amounts. If your agency is <strong>currently holding</strong> these
              deposits, we can carry them into your deposit and trust ledger as opening balances — which is what
              makes interest accrual and move-out refunds work. If you don&apos;t confirm this, the amounts are
              still recorded against each lease, but nothing is posted to your trust ledger.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={depositsHeld}
                onChange={(e) => setDepositsHeld(e.target.checked)}
                className="accent-brand mt-0.5"
              />
              <span className="text-xs">
                My agency holds these deposits — post them as opening balances to my trust ledger.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mb-6">
        This cannot be undone. Records will be created in your account immediately.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-danger-bg border border-danger/20 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <ActionButton tone="secondary" icon={<ArrowLeft className="size-4" />} onClick={onBack} disabled={loading}>
          Back
        </ActionButton>
        <ActionButton tone="primary" icon={loading ? <Loader2 className="size-4 animate-spin" /> : undefined} onClick={handleImport} className="flex-1" disabled={loading}>
          {loading ? progress : "Import now"}
        </ActionButton>
      </div>
    </div>
  )
}
