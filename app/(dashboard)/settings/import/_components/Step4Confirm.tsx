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

  /**
   * What an agency is told when the import is INTERRUPTED rather than REJECTED.
   *
   * A killed import leaves the book half-written (there is no wrapping transaction — a 5 000-row book cannot be
   * one). The agency sees a failure and has no way to know whether pressing the button again will DOUBLE their
   * data. It will not: the import is idempotent, and crash-convergence is proven under test — a run killed at
   * any depth, re-run, ends up exactly where one clean run would have.
   *
   * That certainty is worthless while it lives only in a test file. This is where it reaches the person who
   * needs it. (~3 000 leases is the ceiling of the platform's function time limit; above it, splitting the file
   * is the honest workaround until the import is batched — OUTSTANDING § D-VOL-01. A known ceiling with a
   * signposted path is fine; a silent cliff is not.)
   */
  const INTERRUPTED_MESSAGE =
    "The import was interrupted before it finished — a dropped connection, or a book large enough to run past " +
    "the time limit. Your data is fine and NOTHING WAS DUPLICATED: it is safe to press Import again, and it " +
    "will pick up exactly what is missing. If your book is very large (roughly 3 000 leases or more), split " +
    "the file and import it in parts."

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
        // A 504/502/503 is the import being KILLED mid-run (a big book against the function's time limit), not
        // the agency's data being rejected. Those are opposite messages: one says "your file is wrong", the
        // other says "nothing is wrong, press the button again". Telling an agency their book is bad when their
        // import merely timed out is how you lose them.
        if (res.status === 504 || res.status === 502 || res.status === 503) {
          setError(INTERRUPTED_MESSAGE)
          setLoading(false)
          return
        }
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
      // The request never completed — the connection dropped, or the import ran past its time limit and the
      // function was killed. Either way the agency's data is fine and a re-run is SAFE: the import is
      // idempotent by construction and crash-convergence is proven (a killed import, re-run, ends up exactly
      // where a single clean run would have). They are the only ones who cannot know that, so we say it.
      setError(INTERRUPTED_MESSAGE)
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
