"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormSelect } from "@/components/ui/FormSelect"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"
import { Loader2, Plus } from "lucide-react"

interface ReserveFundEntry {
  id: string
  entry_type: string
  direction: string
  amount_cents: number
  description: string
  reference: string | null
  created_at: string
}

interface Props {
  hoaId: string
  initialEntries: ReserveFundEntry[]
  initialBalance: number
}

const ENTRY_TYPES = [
  { value: "levy_contribution", label: "Levy Contribution" },
  { value: "capital_expenditure", label: "Capital Expenditure" },
  { value: "interest_earned", label: "Interest Earned" },
  { value: "adjustment", label: "Adjustment" },
]

export function ReserveFundManager({ hoaId, initialEntries, initialBalance }: Readonly<Props>) {
  const [entries, setEntries] = useState<ReserveFundEntry[]>(initialEntries)
  const [balance, setBalance] = useState(initialBalance)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    entry_type: "levy_contribution",
    direction: "credit",
    amount_rands: "",
    description: "",
    reference: "",
  })

  function setF(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleAdd() {
    const cents = Math.round(parseFloat(form.amount_rands) * 100)
    if (!form.description.trim() || isNaN(cents) || cents <= 0) {
      toast.error("Fill in description and a valid amount")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/hoa/${hoaId}/reserve-fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type: form.entry_type,
          direction: form.direction,
          amount_cents: cents,
          description: form.description.trim(),
          reference: form.reference || undefined,
        }),
      })
      const data = await res.json() as ReserveFundEntry & { error?: string }
      if (!res.ok) { toast.error(data.error ?? "Failed to add entry"); return }
      setEntries((e) => [data, ...e])
      setBalance((b) => form.direction === "credit" ? b + cents : b - cents)
      setShowForm(false)
      setForm({ entry_type: "levy_contribution", direction: "credit", amount_rands: "", description: "", reference: "" })
      toast.success("Entry recorded")
    } finally {
      setSaving(false)
    }
  }

  const TYPE_LABELS: Record<string, string> = Object.fromEntries(ENTRY_TYPES.map((t) => [t.value, t.label]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Reserve Fund</CardTitle>
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="size-3.5 mr-1.5" />
              Add entry
            </Button>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl text-emerald-600">{formatZAR(balance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Running balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Admin Fund</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Admin fund income is tracked via levy invoices. View detailed
              income/expenditure in the Reports section.
            </p>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-sm">New Reserve Fund Entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Entry type *</label>
                <FormSelect
                  value={form.entry_type}
                  onValueChange={(v) => setF("entry_type", v)}
                  options={ENTRY_TYPES}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Direction *</label>
                <FormSelect
                  value={form.direction}
                  onValueChange={(v) => setF("direction", v)}
                  options={[
                    { value: "credit", label: "Credit (money in)" },
                    { value: "debit", label: "Debit (money out)" },
                  ]}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Amount (R) *</label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={form.amount_rands}
                  onChange={(e) => setF("amount_rands", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Reference</label>
                <Input placeholder="Invoice no. or reference" value={form.reference}
                  onChange={(e) => setF("reference", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
                <Input placeholder="e.g. Q1 levy contribution from levy invoices" value={form.description}
                  onChange={(e) => setF("description", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving…</> : "Record entry"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {entries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Transaction History</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Date</th>
                  <th className="text-left py-2 pr-2">Type</th>
                  <th className="text-left py-2 pr-2">Description</th>
                  <th className="text-left py-2 pr-2">Ref</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2 pr-2 text-xs">{formatDateShort(new Date(e.created_at))}</td>
                    <td className="py-2 pr-2 text-xs">{TYPE_LABELS[e.entry_type] ?? e.entry_type}</td>
                    <td className="py-2 pr-2">{e.description}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{e.reference ?? "—"}</td>
                    <td className={`text-right py-2 font-medium ${e.direction === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                      {e.direction === "credit" ? "+" : "-"}{formatZAR(e.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
