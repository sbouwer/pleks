"use client"

/**
 * app/(supplier)/supplier/jobs/[requestId]/quote/page.tsx — Supplier quote submission form
 *
 * Route:  /supplier/jobs/[requestId]/quote
 * Auth:   submitSupplierQuote server action (getSupplierSession) — ADDENDUM_00M
 * Data:   submits via the server action (no browser-client DB read of contractor_view / write)
 */

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { submitSupplierQuote } from "@/lib/actions/supplierQuote"
import { formatZAR } from "@/lib/constants"
import { toast } from "sonner"

interface LineItem {
  description: string
  quantity: number
  unit_price_cents: number
  vat_applicable: boolean
}

export default function QuoteSubmissionPage() {
  const router = useRouter()
  const params = useParams()
  const requestId = params.requestId as string

  const [quoteType, setQuoteType] = useState<string>("quote")
  const [scopeOfWork, setScopeOfWork] = useState("")
  const [exclusions, setExclusions] = useState("")
  const [estimatedDuration, setEstimatedDuration] = useState("")
  const [materialsIncluded, setMaterialsIncluded] = useState(true)
  const [callOutIncluded, setCallOutIncluded] = useState(true)
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price_cents: 0, vat_applicable: true },
  ])

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price_cents: 0, vat_applicable: true }])
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number | boolean) {
    setLineItems(lineItems.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const subtotal = lineItems.reduce((s, item) => s + (item.quantity * item.unit_price_cents), 0)
  const vatAmount = isVatRegistered ? Math.round(subtotal * 0.15) : 0
  const total = subtotal + vatAmount

  async function handleSubmit() {
    if (!scopeOfWork.trim()) { toast.error("Please describe the scope of work"); return }
    if (lineItems.some((i) => !i.description.trim() || i.unit_price_cents <= 0)) {
      toast.error("Please fill in all line items")
      return
    }

    setSubmitting(true)
    const result = await submitSupplierQuote({
      requestId,
      quoteType,
      lineItems,
      scopeOfWork,
      exclusions:        exclusions || null,
      estimatedDuration: estimatedDuration || null,
      materialsIncluded,
      callOutIncluded,
      notes:             notes || null,
      isVatRegistered,
    })

    if (!result.ok) {
      toast.error(result.error ?? "Failed to submit quote")
      setSubmitting(false)
      return
    }

    toast.success("Quote submitted")
    router.push(`/supplier/jobs/${requestId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Submit Quote</h1>
      </div>

      {/* Quote type */}
      <div>
        <Label className="text-xs">Quote type</Label>
        <Select value={quoteType} onValueChange={(v) => setQuoteType(v ?? "quote")}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quote">Firm quote (binding)</SelectItem>
            <SelectItem value="estimate">Estimate (indicative)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scope of work */}
      <div>
        <Label className="text-xs">Scope of work</Label>
        <Textarea
          value={scopeOfWork}
          onChange={(e) => setScopeOfWork(e.target.value)}
          placeholder="Describe what work will be done..."
          rows={4}
        />
      </div>

      {/* Exclusions */}
      <div>
        <Label className="text-xs">Exclusions (optional)</Label>
        <Textarea
          value={exclusions}
          onChange={(e) => setExclusions(e.target.value)}
          placeholder="What is NOT included..."
          rows={2}
        />
      </div>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineItems.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  value={item.description}
                  onChange={(e) => updateLineItem(i, "description", e.target.value)}
                  placeholder="Description"
                  className="h-10"
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)}
                    className="h-10 w-20"
                    min={1}
                  />
                  <Input
                    type="number"
                    value={item.unit_price_cents / 100}
                    onChange={(e) => updateLineItem(i, "unit_price_cents", Math.round(parseFloat(e.target.value) * 100) || 0)}
                    placeholder="Price (R)"
                    className="h-10 flex-1"
                    min={0}
                    step={0.01}
                  />
                  <span className="text-sm text-muted-foreground self-center whitespace-nowrap">
                    = {formatZAR(item.quantity * item.unit_price_cents)}
                  </span>
                </div>
              </div>
              {lineItems.length > 1 && (
                <ActionButton tone="secondary" size="sm" onClick={() => removeLineItem(i)} className="mt-1">
                  <Trash2 className="size-4" />
                </ActionButton>
              )}
            </div>
          ))}
          <ActionButton tone="secondary" size="sm" onClick={addLineItem}>
            <Plus className="size-3.5 mr-1.5" />
            Add line item
          </ActionButton>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal (excl. VAT)</span>
            <span>{formatZAR(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isVatRegistered}
                onChange={(e) => setIsVatRegistered(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              VAT registered (15%)
            </label>
            <span>{formatZAR(vatAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold text-base">
            <span>Total</span>
            <span>{formatZAR(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Duration and options */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Estimated duration</Label>
          <Input
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(e.target.value)}
            placeholder="e.g. 2-3 hours"
            className="h-10"
          />
        </div>
        <div className="space-y-2 pt-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={materialsIncluded} onChange={(e) => setMaterialsIncluded(e.target.checked)} className="h-4 w-4 rounded" />
            Materials included
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={callOutIncluded} onChange={(e) => setCallOutIncluded(e.target.checked)} className="h-4 w-4 rounded" />
            Call-out included
          </label>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label className="text-xs">Additional notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else the agent should know..."
          rows={2}
        />
      </div>

      {/* Submit */}
      <ActionButton
        tone="primary"
        className="w-full h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "Submitting..." : "Submit Quote"}
      </ActionButton>
    </div>
  )
}
