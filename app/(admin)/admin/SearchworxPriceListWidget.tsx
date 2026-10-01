"use client"

/**
 * app/(admin)/admin/SearchworxPriceListWidget.tsx — upload a Searchworx price-list export (ADDENDUM_14V §3.2a)
 *
 * Auth:   Rendered inside admin layout (requireAdminAuth cookie gate); the route re-checks isAdminAuthenticated
 * Data:   POST /api/admin/searchworx-rates/import — records observations; the daily cron moves rates
 * Notes:  Reads the file in the browser and posts its text. The result lists what mapped and how many names
 *         were reported unmapped, because an import that silently dropped a product is the failure to see.
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"

interface ImportSummary {
  ok: boolean
  reason: string | null
  recorded: number
  mapped: { product_key: string; confidence: string; line: number }[]
  unmapped: { name: string }[]
  rejected: { line: number; reason: string }[]
}

export function SearchworxPriceListWidget() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [effectiveDate, setEffectiveDate] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  async function handleImport() {
    if (!file || !effectiveDate) {
      toast.error("A price-list file and its effective date are required")
      return
    }
    setLoading(true)
    setSummary(null)
    try {
      const res = await fetch("/api/admin/searchworx-rates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, csv: await file.text(), vendor_effective_date: effectiveDate }),
      })
      const body = (await res.json()) as ImportSummary & { error?: string }
      if (res.status === 200 || res.status === 422) {
        setSummary(body)
        if (body.ok) toast.success(`Recorded ${body.recorded} price observations`)
        else toast.error(`Nothing imported — ${body.reason}`)
      } else {
        toast.error(body.error ?? "Import failed")
      }
    } catch {
      toast.error("Import failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">Searchworx price list</p>
        <p className="text-xs text-muted-foreground">Observations only — the daily sync moves rates</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
          Import
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Searchworx price list</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sw-pricelist">Price-list CSV (Search Type, Price)</Label>
              <Input id="sw-pricelist" type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label>Effective date (the list&apos;s date)</Label>
              <DatePickerInput value={effectiveDate} onChange={setEffectiveDate} />
            </div>
            <ActionButton onClick={handleImport} disabled={loading} className="w-full">
              {loading ? "Importing…" : "Import"}
            </ActionButton>
            {summary && (
              <div className="space-y-1 text-xs">
                <p>
                  {summary.ok ? `Recorded ${summary.recorded}` : `Nothing imported (${summary.reason})`} · {summary.unmapped.length} unmapped ·{" "}
                  {summary.rejected.length} rejected
                </p>
                {summary.mapped.map((m) => (
                  <p key={m.product_key} className="text-muted-foreground">
                    {m.product_key} — line {m.line} ({m.confidence})
                  </p>
                ))}
                {summary.rejected.map((r) => (
                  <p key={r.line} className="text-destructive">
                    line {r.line}: {r.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
