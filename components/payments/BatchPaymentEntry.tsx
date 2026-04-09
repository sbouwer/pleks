"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatZAR } from "@/lib/constants"
import { Plus, Trash2 } from "lucide-react"

interface OpenInvoice {
  id: string
  invoice_number: string
  period_from: string
  period_to: string
  balance_cents: number
  total_amount_cents: number
  payment_reference: string | null
  tenant_view: { first_name: string | null; last_name: string | null } | null
  units: { unit_number: string | null } | null
}

interface PaymentRow {
  key: string
  invoiceId: string
  tenantName: string
  unitNumber: string
  invoiceNumber: string
  balanceCents: number
  amount: string
  date: string
  method: string
  reference: string
}

const PAYMENT_METHODS = ["EFT", "Cash", "DebiCheck", "Cheque", "Other"]

function today() {
  return new Date().toISOString().split("T")[0]
}

function tenantLabel(inv: OpenInvoice): string {
  const tv = inv.tenant_view
  if (!tv) return "Unknown tenant"
  return [tv.first_name, tv.last_name].filter(Boolean).join(" ") || "Unknown"
}

function diffLabel(amountCents: number, balanceCents: number): { text: string; warn: boolean } | null {
  if (!amountCents) return null
  const diff = amountCents - balanceCents
  if (diff === 0) return null
  if (diff < 0) return { text: `Short ${formatZAR(-diff)}`, warn: true }
  return { text: `Overpayment ${formatZAR(diff)}`, warn: false }
}

export function BatchPaymentEntry() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<OpenInvoice[]>([])
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    fetch("/api/rent-invoices?status=open")
      .then((r) => r.ok ? r.json() : [])
      .then((data: OpenInvoice[]) => {
        setInvoices(data)
        // Pre-populate one row per open invoice
        setRows(
          data.map((inv) => ({
            key: inv.id,
            invoiceId: inv.id,
            tenantName: tenantLabel(inv),
            unitNumber: inv.units?.unit_number ?? "",
            invoiceNumber: inv.invoice_number,
            balanceCents: inv.balance_cents,
            amount: String(inv.balance_cents / 100),
            date: today(),
            method: "EFT",
            reference: inv.payment_reference ?? "",
          }))
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function updateRow(key: string, patch: Partial<PaymentRow>) {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function addBlankRow() {
    setRows((prev) => [...prev, {
      key: crypto.randomUUID(),
      invoiceId: "",
      tenantName: "",
      unitNumber: "",
      invoiceNumber: "",
      balanceCents: 0,
      amount: "",
      date: today(),
      method: "EFT",
      reference: "",
    }])
  }

  // When selecting invoice from dropdown in a blank row
  function selectInvoice(key: string, invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId)
    if (!inv) return
    updateRow(key, {
      invoiceId,
      tenantName: tenantLabel(inv),
      unitNumber: inv.units?.unit_number ?? "",
      invoiceNumber: inv.invoice_number,
      balanceCents: inv.balance_cents,
      amount: String(inv.balance_cents / 100),
      reference: inv.payment_reference ?? "",
    })
  }

  const totalCents = rows.reduce((s, r) => s + (Math.round(Number.parseFloat(r.amount) * 100) || 0), 0)
  const fullCount = rows.filter((r) => {
    const paid = Math.round(Number.parseFloat(r.amount) * 100) || 0
    return paid >= r.balanceCents && r.balanceCents > 0
  }).length
  const partialCount = rows.filter((r) => {
    const paid = Math.round(Number.parseFloat(r.amount) * 100) || 0
    return paid > 0 && paid < r.balanceCents
  }).length

  function handleRecordAll() {
    const payments = rows
      .filter((r) => r.invoiceId && Number.parseFloat(r.amount) > 0)
      .map((r) => ({
        invoiceId: r.invoiceId,
        amountCents: Math.round(Number.parseFloat(r.amount) * 100),
        paymentDate: r.date,
        method: r.method,
        reference: r.reference,
      }))

    if (!payments.length) {
      toast.error("No payments to record")
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/rent-invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payments }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error((data as { error?: string }).error ?? "Failed to record payments")
          return
        }
        const result = await res.json() as { recorded: number; totalCents: number }
        toast.success(`${result.recorded} payment${result.recorded !== 1 ? "s" : ""} recorded — ${formatZAR(result.totalCents)}`)
        router.refresh()
        // Reload open invoices after recording
        setLoading(true)
        fetch("/api/rent-invoices?status=open")
          .then((r) => r.ok ? r.json() : [])
          .then((data: OpenInvoice[]) => {
            setInvoices(data)
            setRows(data.map((inv) => ({
              key: inv.id,
              invoiceId: inv.id,
              tenantName: tenantLabel(inv),
              unitNumber: inv.units?.unit_number ?? "",
              invoiceNumber: inv.invoice_number,
              balanceCents: inv.balance_cents,
              amount: String(inv.balance_cents / 100),
              date: today(),
              method: "EFT",
              reference: inv.payment_reference ?? "",
            })))
            setLoading(false)
          })
          .catch(() => setLoading(false))
      } catch {
        toast.error("Failed to record payments")
      }
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading open invoices…</p>
  }

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No open invoices — all caught up.</p>
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium pr-3">Tenant · Unit</th>
              <th className="pb-2 text-left font-medium pr-3">Invoice</th>
              <th className="pb-2 text-left font-medium pr-3 w-28">Amount (R)</th>
              <th className="pb-2 text-left font-medium pr-3 w-32">Date</th>
              <th className="pb-2 text-left font-medium pr-3 w-28">Method</th>
              <th className="pb-2 text-left font-medium pr-3">Reference</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row) => {
              const amountCents = Math.round(Number.parseFloat(row.amount) * 100) || 0
              const diff = diffLabel(amountCents, row.balanceCents)
              return (
                <tr key={row.key} className="align-top">
                  <td className="py-2 pr-3">
                    {row.invoiceId ? (
                      <div>
                        <p className="font-medium">{row.tenantName}</p>
                        <p className="text-xs text-muted-foreground">{row.unitNumber}</p>
                        <p className="text-xs text-muted-foreground">Balance: {formatZAR(row.balanceCents)}</p>
                      </div>
                    ) : (
                      <select
                        className="h-8 text-sm border border-border rounded-md px-2 bg-background w-full"
                        value=""
                        onChange={(e) => selectInvoice(row.key, e.target.value)}
                      >
                        <option value="">Select tenant…</option>
                        {invoices
                          .filter((inv) => !rows.some((r) => r.key !== row.key && r.invoiceId === inv.id))
                          .map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {tenantLabel(inv)} — {inv.units?.unit_number ?? ""} ({formatZAR(inv.balance_cents)})
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    <p>{row.invoiceNumber}</p>
                    {row.invoiceId && (
                      <p>{row.balanceCents > 0 && amountCents === row.balanceCents ? "✓ Full" : ""}</p>
                    )}
                    {diff && (
                      <p className={diff.warn ? "text-warning" : "text-muted-foreground"}>{diff.text}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-sm w-28"
                      value={row.amount}
                      onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="date"
                      className="h-8 text-sm w-32"
                      value={row.date}
                      onChange={(e) => updateRow(row.key, { date: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="h-8 text-sm border border-border rounded-md px-2 bg-background"
                      value={row.method}
                      onChange={(e) => updateRow(row.key, { method: e.target.value })}
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      className="h-8 text-sm"
                      placeholder="e.g. SMITH-F2"
                      value={row.reference}
                      onChange={(e) => updateRow(row.key, { reference: e.target.value })}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-muted-foreground hover:text-destructive mt-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addBlankRow}
        className="flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 transition-colors"
      >
        <Plus className="size-3.5" /> Add row
      </button>

      {/* Summary + action */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {rows.length} payment{rows.length !== 1 ? "s" : ""} · {formatZAR(totalCents)}
          {fullCount > 0 && ` · ${fullCount} paid in full`}
          {partialCount > 0 && ` · ${partialCount} partial`}
        </p>
        <Button
          size="sm"
          onClick={handleRecordAll}
          disabled={isPending || rows.every((r) => Number.parseFloat(r.amount) <= 0)}
        >
          {isPending ? "Recording…" : "Record all payments"}
        </Button>
      </div>
    </div>
  )
}
