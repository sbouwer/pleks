"use client"

/**
 * app/(admin)/admin/SearchworxPriceListWidget.tsx — upload a Searchworx price-list export (ADDENDUM_14V §3.2a)
 *
 * Auth:   Rendered inside admin layout (requireAdminAuth cookie gate); the route re-checks isAdminAuthenticated
 * Data:   POST /api/admin/searchworx-rates/import — records observations; the daily cron moves rates
 * Notes:  Reads the file in the browser and posts its text. Searchworx delivers an .xls: a workbook is turned into
 *         the same text by lib/searchworx/rates/priceListFile.ts (SheetJS loaded only when a workbook is picked),
 *         and its metadata tab's EffectiveDate is SHOWN beside the date field — never filled in for the admin, who
 *         confirms it. That date is METADATA (ADDENDUM_14V §8, ruled 2026-10-01): a list applies to quoting from its
 *         import day, and one already older than staleAfterDays on arrival is flagged in the result.
 *         The result lists what mapped and how many names were reported unmapped, because an import that silently
 *         dropped a product is the failure to see.
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { VendorListMeta } from "@/lib/searchworx/rates/priceListFile"

interface ImportSummary {
  ok: boolean
  reason: string | null
  recorded: number
  mapped: { product_key: string; confidence: string; line: number }[]
  unmapped: { name: string }[]
  rejected: { line: number; reason: string }[]
  stale_on_arrival: { vendor_effective_date: string; age_days: number; stale_after_days: number } | null
}

/** The file's price-list text: a CSV as-is, a workbook through priceListFile. Throws with the refusal reason. */
async function readPriceList(file: File): Promise<{ text: string; meta: VendorListMeta | null }> {
  if (file.name.toLowerCase().endsWith(".csv")) return { text: await file.text(), meta: null }
  const XLSX = await import("xlsx")
  const { priceListSheetText } = await import("@/lib/searchworx/rates/priceListFile")
  const r = priceListSheetText(await file.arrayBuffer(), XLSX)
  if (!r.ok) throw new Error(r.error)
  return { text: r.text, meta: r.meta }
}

export function SearchworxPriceListWidget() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [effectiveDate, setEffectiveDate] = useState("")
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [list, setList] = useState<{ text: string; meta: VendorListMeta | null } | null>(null)

  async function handleFile(picked: File | null) {
    setFile(picked)
    setList(null)
    setSummary(null)
    if (!picked) return
    try {
      setList(await readPriceList(picked))
    } catch (e) {
      setFile(null)
      toast.error(`Not a price list this import can read — ${e instanceof Error ? e.message : "unreadable file"}`)
    }
  }

  async function handleImport() {
    if (!file || !list || !effectiveDate) {
      toast.error("A price-list file and its effective date are required")
      return
    }
    setLoading(true)
    setSummary(null)
    try {
      const res = await fetch("/api/admin/searchworx-rates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, csv: list.text, vendor_effective_date: effectiveDate }),
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
              <Label htmlFor="sw-pricelist">Price list — the Searchworx .xls (or a CSV of it)</Label>
              <Input id="sw-pricelist" type="file" accept=".xls,.xlsx,.csv" onChange={(e) => void handleFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label>The vendor&apos;s date printed on the list</Label>
              <p className="text-xs text-muted-foreground">
                Recorded as metadata. The prices apply to quoting from today, the day you import them.
              </p>
              <DatePickerInput value={effectiveDate} onChange={setEffectiveDate} />
              {list?.meta && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The file says: {list.meta.category ?? "—"}, effective {list.meta.effectiveDate ?? list.meta.effectiveDateText ?? "—"}
                </p>
              )}
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
                {summary.stale_on_arrival && (
                  <p className="text-amber-600">
                    This list is dated {summary.stale_on_arrival.vendor_effective_date} — {summary.stale_on_arrival.age_days} days old,
                    beyond the {summary.stale_on_arrival.stale_after_days}-day staleness limit. It was imported; check Searchworx
                    for a newer one.
                  </p>
                )}
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
