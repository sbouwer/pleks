"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react"
import { normaliseDate } from "@/lib/import/normalise"
import { formatZAR } from "@/lib/constants"

interface Step3Props {
  rows: Record<string, string>[]
  mapping: Record<string, { field: string; entity: string }>
  onBack: () => void
  onConfirm: (action: "skip" | "import_as_expired", overrides: Record<number, "active" | "skip">) => void
}

export function Step3ExpiredLeases({ rows, mapping, onBack, onConfirm }: Readonly<Step3Props>) {
  const [action, setAction] = useState<"skip" | "import_as_expired">("skip")
  const [overrides, setOverrides] = useState<Record<number, "active" | "skip">>({})

  // Find the column mapped to lease_end
  const endDateCol = Object.entries(mapping).find(([, m]) => m.field === "lease_end")?.[0]
  const nameCol = Object.entries(mapping).find(([, m]) => m.field === "first_name" || m.field === "__split_name")?.[0]
  const unitCol = Object.entries(mapping).find(([, m]) => m.field === "unit_number")?.[0]
  const rentCol = Object.entries(mapping).find(([, m]) => m.field === "rent_amount_cents")?.[0]

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiredRows = rows.map((row, i) => ({ row, index: i })).filter(({ row }) => {
    if (!endDateCol) return false
    const raw = row[endDateCol]
    if (!raw?.trim()) return false
    const normalised = normaliseDate(raw)
    if (!normalised) return false
    return new Date(normalised) < today
  })

  if (expiredRows.length === 0) {
    // No expired leases — auto-skip this step
    onConfirm("skip", {})
    return null
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">Expired leases found</h2>
      <div className="flex items-start gap-2 mb-6 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
        <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-200">
          {expiredRows.length} lease{expiredRows.length > 1 ? "s have" : " has"} end dates in the past.
        </p>
      </div>

      {/* Global action */}
      <div className="space-y-2 mb-6">
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-border hover:border-brand/30 transition-colors">
          <input type="radio" name="expired_action" checked={action === "skip"} onChange={() => setAction("skip")} className="accent-brand mt-1" />
          <div>
            <p className="text-sm font-medium">Skip expired leases <Badge variant="secondary" className="ml-2 text-[10px]">Recommended</Badge></p>
            <p className="text-xs text-muted-foreground">Only active leases imported. Best for going live now.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-border hover:border-brand/30 transition-colors">
          <input type="radio" name="expired_action" checked={action === "import_as_expired"} onChange={() => setAction("import_as_expired")} className="accent-brand mt-1" />
          <div>
            <p className="text-sm font-medium">Import as expired</p>
            <p className="text-xs text-muted-foreground">Creates tenant + lease records with status &apos;expired&apos;. No invoice cycle.</p>
          </div>
        </label>
      </div>

      {/* Expired rows table */}
      <Card className="mb-6">
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Tenant</th>
                <th className="text-left py-2">Unit</th>
                <th className="text-left py-2">Ended</th>
                <th className="text-left py-2">Rent</th>
                <th className="text-center py-2">Override</th>
              </tr>
            </thead>
            <tbody>
              {expiredRows.map(({ row, index }) => (
                <tr key={index} className="border-b border-border/50">
                  <td className="py-2">{nameCol ? row[nameCol] : `Row ${index + 1}`}</td>
                  <td className="py-2 text-muted-foreground">{unitCol ? row[unitCol] : "—"}</td>
                  <td className="py-2 text-muted-foreground">{endDateCol ? row[endDateCol] : "—"}</td>
                  <td className="py-2">{rentCol ? formatZAR(Math.round(Number.parseFloat(row[rentCol]?.replace(/[R\s,]/g, "") || "0") * 100)) : "—"}</td>
                  <td className="py-2 text-center">
                    <label className="flex items-center justify-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrides[index] === "active"}
                        onChange={(e) => {
                          const updated = { ...overrides }
                          if (e.target.checked) updated[index] = "active"
                          else delete updated[index]
                          setOverrides(updated)
                        }}
                        className="accent-brand"
                      />
                      <span className="text-xs text-muted-foreground">Keep active</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Button onClick={() => onConfirm(action, overrides)} className="flex-1">
          Continue <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
