"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { matchCsvRows, confirmBulkPayments } from "./actions"
import type { ParsedRow, MatchedRow, ConfirmedPayment } from "./actions"
import { formatZAR } from "@/lib/constants"
import { DesktopOnlyCard } from "@/components/mobile/DesktopOnlyCard"

function confirmLabel(count: number): string {
  return "Record " + count + " payment" + (count === 1 ? "" : "s")
}

const SAMPLE = `2024-03-01,Tenant EFT,INV-2024-00042,8500.00
2024-03-01,John Smith payment,INV-2024-00043,12000.00
2024-03-02,EFT deposit,INV-2024-00044,6500.00`

type Step = "input" | "review" | "done"

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "")
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : Math.round(val * 100)
}

function parseDate(raw: string): string {
  const trimmed = raw.trim()
  // Try DD/MM/YYYY
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (ddmmyyyy) return ddmmyyyy[3] + "-" + ddmmyyyy[2].padStart(2, "0") + "-" + ddmmyyyy[1].padStart(2, "0")
  // Already YYYY-MM-DD or close
  return trimmed.slice(0, 10)
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ""
  let inQuote = false
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      cols.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  cols.push(cur.trim())
  return cols
}

function parseRows(raw: string): ParsedRow[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
  const rows: ParsedRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 2) continue

    // Try to detect header row
    const firstCol = cols[0].toLowerCase()
    if (i === 0 && (firstCol === "date" || firstCol === "transaction date")) continue

    // Find amount column — last numeric column
    let amountCents = 0
    let amountIdx = -1
    for (let j = cols.length - 1; j >= 1; j--) {
      const val = parseAmount(cols[j])
      if (val > 0) {
        amountCents = val
        amountIdx = j
        break
      }
    }

    if (amountCents === 0) continue

    const date = parseDate(cols[0])
    const description = cols[1] ?? ""
    const reference = (cols.length >= 4 && amountIdx >= 3) ? (cols[2] ?? null) : null

    rows.push({ rowIndex: i, date, description, reference, amountCents })
  }

  return rows
}

function ConfidenceBadge({ confidence }: { confidence: MatchedRow["confidence"] }) {
  if (confidence === "exact") return (
    <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Exact</span>
  )
  if (confidence === "amount") return (
    <span className="flex items-center gap-1 text-amber-600 text-xs"><AlertCircle className="h-3.5 w-3.5" />Amount match</span>
  )
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3.5 w-3.5" />Unmatched</span>
  )
}

export default function BulkImportPage() {
  const [step, setStep] = useState<Step>("input")
  const [csvText, setCsvText] = useState("")
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [matching, startMatch] = useTransition()
  const [confirming, startConfirm] = useTransition()
  const [createdCount, setCreatedCount] = useState(0)

  function handleParse() {
    const rows = parseRows(csvText)
    if (rows.length === 0) {
      toast.error("No valid rows found. Check your CSV format.")
      return
    }
    startMatch(async () => {
      const result = await matchCsvRows(rows)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setMatchedRows(result.matched)
      // Pre-select all matched rows
      const preSelected = new Set(result.matched.filter((r) => r.confidence !== "none").map((r) => r.rowIndex))
      setSelectedRows(preSelected)
      setStep("review")
    })
  }

  function toggleRow(rowIndex: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }

  function handleConfirm() {
    const toCreate: ConfirmedPayment[] = matchedRows
      .filter((r) => selectedRows.has(r.rowIndex) && r.matchedInvoiceId && r.matchedLeaseId && r.matchedTenantId)
      .map((r) => ({
        invoiceId: r.matchedInvoiceId!,
        leaseId: r.matchedLeaseId!,
        tenantId: r.matchedTenantId!,
        amountCents: r.amountCents,
        date: r.date,
        reference: r.reference,
        description: r.description,
      }))

    if (toCreate.length === 0) {
      toast.error("No matched rows selected")
      return
    }

    startConfirm(async () => {
      const result = await confirmBulkPayments(toCreate)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setCreatedCount(result.created)
      setStep("done")
    })
  }

  if (step === "done") {
    return (
      <>
        {/* Mobile: desktop-only gate */}
        <div className="lg:hidden">
          <DesktopOnlyCard title="Bulk Payment Import" description="Bulk payment import works best on a larger screen. Open Pleks on your computer to use this feature." />
        </div>
        {/* Desktop */}
        <div className="hidden lg:block">
          <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="font-heading text-2xl">{createdCount} payment{createdCount === 1 ? "" : "s"} recorded</h1>
            <p className="text-muted-foreground">All confirmed matches have been recorded and invoices updated.</p>
            <div className="flex gap-3 justify-center mt-6">
              <Button onClick={() => { setStep("input"); setCsvText(""); setMatchedRows([]); setSelectedRows(new Set()) }}>
                Import more
              </Button>
              <Link href="/payments">
                <Button variant="outline">View payments</Button>
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (step === "review") {
    const matchedCount = matchedRows.filter((r) => r.confidence !== "none").length
    const selectedCount = selectedRows.size

    return (
      <>
        {/* Mobile: desktop-only gate */}
        <div className="lg:hidden">
          <DesktopOnlyCard title="Bulk Payment Import" description="Bulk payment import works best on a larger screen. Open Pleks on your computer to use this feature." />
        </div>
        {/* Desktop */}
        <div className="hidden lg:block">
        <div className="space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setStep("input")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to CSV
            </button>
            <h1 className="font-heading text-2xl">Review matches</h1>
            <p className="text-muted-foreground text-sm">{matchedCount} of {matchedRows.length} rows matched · {selectedCount} selected</p>
          </div>
          <Button onClick={handleConfirm} disabled={confirming || selectedCount === 0}>
            {confirming && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {confirming ? "Recording…" : confirmLabel(selectedCount)}
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2.5 w-10"></th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Matched to</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {matchedRows.map((row) => {
                  const canSelect = row.confidence !== "none"
                  const isSelected = selectedRows.has(row.rowIndex)
                  return (
                    <tr
                      key={row.rowIndex}
                      className={`transition-colors ${isSelected ? "bg-accent/30" : ""} ${canSelect ? "cursor-pointer hover:bg-muted/30" : "opacity-50"}`}
                      onClick={() => canSelect && toggleRow(row.rowIndex)}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={() => canSelect && toggleRow(row.rowIndex)}
                          className="cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {new Date(row.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <p className="truncate">{row.description}</p>
                        {row.reference && <p className="text-[11px] text-muted-foreground font-mono">{row.reference}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatZAR(row.amountCents)}</td>
                      <td className="px-3 py-2.5">
                        {row.matchedTenantName ? (
                          <div>
                            <p className="font-medium">{row.matchedTenantName}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{row.matchedInvoiceNumber}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <ConfidenceBadge confidence={row.confidence} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
      </>
    )
  }

  // Step: input
  return (
    <>
      {/* Mobile: desktop-only gate */}
      <div className="lg:hidden">
        <DesktopOnlyCard title="Bulk Payment Import" description="Bulk payment import works best on a larger screen. Open Pleks on your computer to use this feature." />
      </div>
      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="max-w-2xl mx-auto space-y-6 pb-12">
          <div>
            <Link href="/payments" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to payments
            </Link>
            <h1 className="font-heading text-2xl">Bulk payment import</h1>
            <p className="text-muted-foreground text-sm">Paste bank CSV rows to auto-match against open invoices.</p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">CSV format</p>
              <p className="text-sm text-muted-foreground mb-2">
                Columns: <code className="bg-muted px-1 py-0.5 rounded text-xs">date, description, reference, amount</code> (reference optional)
              </p>
              <pre className="text-xs bg-muted rounded-lg px-3 py-2 text-muted-foreground overflow-x-auto">{SAMPLE}</pre>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Paste CSV rows
              </label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                placeholder={SAMPLE}
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {parseRows(csvText).length} valid rows detected
              </p>
            </div>

            <Button onClick={handleParse} disabled={matching || parseRows(csvText).length === 0} className="w-full">
              {matching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {matching ? "Matching…" : "Match rows →"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
