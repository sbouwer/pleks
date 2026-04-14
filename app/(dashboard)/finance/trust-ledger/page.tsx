"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { formatZAR } from "@/lib/constants"
import { formatTrustType, buildTrustLedgerCSV, type TrustLedgerEntry } from "@/lib/finance/trustLedger"
import { Button } from "@/components/ui/button"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import Link from "next/link"
import { ArrowLeft, Download } from "lucide-react"

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "All types" },
  { value: "rent_received", label: "Rent received" },
  { value: "deposit_received", label: "Deposit received" },
  { value: "deposit_returned", label: "Deposit returned" },
  { value: "deposit_deduction", label: "Deposit deduction" },
  { value: "deposit_interest", label: "Deposit interest" },
  { value: "owner_payment", label: "Owner payout" },
  { value: "management_fee", label: "Management fee" },
  { value: "expense_paid", label: "Expense paid" },
  { value: "adjustment", label: "Adjustment" },
]

function BalanceCell({ cents }: Readonly<{ cents: number }>) {
  return (
    <span className={`tabular-nums font-medium ${cents < 0 ? "text-red-600" : ""}`}>
      {formatZAR(Math.abs(cents))}
    </span>
  )
}

export default function TrustLedgerPage() {
  const { orgId } = useOrg()
  const [entries, setEntries] = useState<TrustLedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [summary, setSummary] = useState<{ total_in_trust_cents: number; last_recon_date: string | null } | null>(null)

  const loadEntries = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const supabase = createClient()

    let q = supabase
      .from("trust_transactions")
      .select(`
        id, created_at, transaction_type, direction, amount_cents,
        description, reference,
        properties(name)
      `)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })

    if (fromDate) q = q.gte("created_at", fromDate)
    if (toDate) q = q.lte("created_at", toDate + "T23:59:59")
    if (typeFilter) q = q.eq("transaction_type", typeFilter)

    const { data, error } = await q
    if (error) { console.error("trust_transactions:", error.message); setLoading(false); return }

    setEntries(
      (data ?? []).map((t) => ({
        id: t.id,
        date: t.created_at.split("T")[0],
        reference: t.reference ?? null,
        transaction_type: t.transaction_type,
        description: t.description ?? "",
        direction: t.direction as "credit" | "debit",
        amount_cents: t.amount_cents,
        property_name: (t.properties as unknown as { name: string } | null)?.name ?? null,
      }))
    )
    setLoading(false)
  }, [orgId, fromDate, toDate, typeFilter])

  useEffect(() => {
    void (async () => { await loadEntries() })()
  }, [loadEntries])

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    void (async () => {
      const [txnRes, reconRes] = await Promise.all([
        supabase.from("trust_transactions").select("direction, amount_cents").eq("org_id", orgId),
        supabase.from("bank_recon_sessions").select("period_end").eq("org_id", orgId).eq("status", "signed_off").order("period_end", { ascending: false }).limit(1),
      ])
      let totalIn = 0
      let totalOut = 0
      for (const t of txnRes.data ?? []) {
        if (t.direction === "credit") { totalIn += t.amount_cents }
        else { totalOut += t.amount_cents }
      }
      setSummary({
        total_in_trust_cents: totalIn - totalOut,
        last_recon_date: reconRes.data?.[0]?.period_end ?? null,
      })
    })()
  }, [orgId])

  const entriesWithBalance = useMemo(() =>
    entries.reduce<Array<TrustLedgerEntry & { runningBalance: number }>>((acc, e) => {
      const prev = acc.at(-1)?.runningBalance ?? 0
      const delta = e.direction === "credit" ? e.amount_cents : -e.amount_cents
      return [...acc, { ...e, runningBalance: prev + delta }]
    }, [])
  , [entries])
  const runningBalance = entriesWithBalance.at(-1)?.runningBalance ?? 0

  function handleCSVDownload() {
    const csv = buildTrustLedgerCSV(entries)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trust-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/finance/deposits" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Finance
          </Link>
          <h1 className="font-heading text-2xl">Trust Account Ledger</h1>
          {summary && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatZAR(summary.total_in_trust_cents)} in trust
              {summary.last_recon_date && ` · Last reconciled ${new Date(summary.last_recon_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCSVDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/payments/reconciliation" />}>
            Reconcile →
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="filter-from" className="text-xs text-muted-foreground block mb-1">From</label>
          <DatePickerInput value={fromDate} onChange={setFromDate} placeholder="From date" />
        </div>
        <div>
          <label htmlFor="filter-to" className="text-xs text-muted-foreground block mb-1">To</label>
          <DatePickerInput value={toDate} onChange={setToDate} placeholder="To date" />
        </div>
        <div>
          <label htmlFor="filter-type" className="text-xs text-muted-foreground block mb-1">Type</label>
          <select
            id="filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-48"
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {(fromDate || toDate || typeFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); setTypeFilter("") }}>
            Clear
          </Button>
        )}
      </div>

      {/* Ledger table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading && <p className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</p>}
        {!loading && entriesWithBalance.length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">No transactions found.</p>
        )}
        {!loading && entriesWithBalance.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Date", "Reference", "Type", "Description", "Property", "In", "Out", "Balance"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {entriesWithBalance.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.reference ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-muted font-medium">{formatTrustType(e.transaction_type)}</span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate">{e.description}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{e.property_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.direction === "credit" ? <span className="text-emerald-600">{formatZAR(e.amount_cents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.direction === "debit" ? <span className="text-red-500">{formatZAR(e.amount_cents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BalanceCell cents={e.runningBalance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Running total footer */}
      {entriesWithBalance.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {entriesWithBalance.length} transactions · Closing balance: <span className="font-semibold text-foreground">{formatZAR(Math.abs(runningBalance))}</span>
        </p>
      )}
    </div>
  )
}
