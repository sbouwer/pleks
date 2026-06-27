"use client"

/**
 * app/(supplier)/supplier/jobs/[requestId]/quote/page.tsx — Supplier quote submission form
 *
 * Route:  /supplier/jobs/[requestId]/quote
 * Auth:   submitSupplierQuote server action (getSupplierSession) — ADDENDUM_00M
 * Data:   submits via the server action (no browser-client DB read of contractor_view / write)
 * Notes:  Canon DetailPageLayout + DetailCard + forms/fields (door style) — presentation only.
 */

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton } from "@/components/ui/actions"
import { TextField, TextareaField, SelectField, FieldGrid } from "@/components/forms/fields"
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

const QUOTE_TYPES = [
  { value: "quote", label: "Firm quote (binding)" },
  { value: "estimate", label: "Estimate (indicative)" },
]

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
    <DetailPageLayout category="Job" backHref={`/supplier/jobs/${requestId}`} title="Submit quote" facts={[]}>
      <DetailFullWidth>
        <div className="max-w-2xl space-y-4">
          <DetailCard title="Quote details">
            <div className="space-y-4">
              <SelectField label="Quote type" value={quoteType} onChange={setQuoteType} options={QUOTE_TYPES} />
              <TextareaField label="Scope of work" value={scopeOfWork} onChange={setScopeOfWork} placeholder="Describe what work will be done..." rows={4} />
              <TextareaField label="Exclusions (optional)" value={exclusions} onChange={setExclusions} placeholder="What is NOT included..." rows={2} />
            </div>
          </DetailCard>

          {/* Line items */}
          <DetailCard title="Line items">
            <div className="space-y-4">
              {lineItems.map((item, i) => (
                <div key={i} className="flex items-end gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex-1 space-y-3">
                    <TextField label="Description" value={item.description} onChange={(v) => updateLineItem(i, "description", v)} placeholder="Description" />
                    <FieldGrid>
                      <TextField label="Qty" type="number" value={String(item.quantity)} onChange={(v) => updateLineItem(i, "quantity", parseInt(v) || 1)} />
                      <TextField label="Unit price (R)" type="number" value={String(item.unit_price_cents / 100)} onChange={(v) => updateLineItem(i, "unit_price_cents", Math.round(parseFloat(v) * 100) || 0)} />
                    </FieldGrid>
                    <p className="text-sm text-muted-foreground">Line total: {formatZAR(item.quantity * item.unit_price_cents)}</p>
                  </div>
                  {lineItems.length > 1 && (
                    <ActionButton tone="secondary" size="sm" onClick={() => removeLineItem(i)}>
                      <Trash2 className="size-4" />
                    </ActionButton>
                  )}
                </div>
              ))}
              <ActionButton tone="secondary" size="sm" onClick={addLineItem}>
                <Plus className="mr-1.5 size-3.5" />
                Add line item
              </ActionButton>
            </div>
          </DetailCard>

          {/* Totals */}
          <DetailCard title="Totals">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-foreground">
                <span>Subtotal (excl. VAT)</span>
                <span>{formatZAR(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={isVatRegistered}
                    onChange={(e) => setIsVatRegistered(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-brand"
                  />
                  VAT registered (15%)
                </label>
                <span className="text-foreground">{formatZAR(vatAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                <span>Total</span>
                <span>{formatZAR(total)}</span>
              </div>
            </div>
          </DetailCard>

          {/* Duration and options */}
          <DetailCard title="Duration & options">
            <div className="space-y-4">
              <TextField label="Estimated duration" value={estimatedDuration} onChange={setEstimatedDuration} placeholder="e.g. 2-3 hours" />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={materialsIncluded} onChange={(e) => setMaterialsIncluded(e.target.checked)} className="h-4 w-4 rounded border-input accent-brand" />
                  Materials included
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={callOutIncluded} onChange={(e) => setCallOutIncluded(e.target.checked)} className="h-4 w-4 rounded border-input accent-brand" />
                  Call-out included
                </label>
              </div>
              <TextareaField label="Additional notes (optional)" value={notes} onChange={setNotes} placeholder="Anything else the agent should know..." rows={2} />
            </div>
          </DetailCard>

          {/* Submit */}
          <ActionButton
            tone="primary"
            className="h-12 w-full text-base font-semibold"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit quote"}
          </ActionButton>
        </div>
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
