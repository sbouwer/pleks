"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Truck, ClipboardCheck, Calendar, XCircle, Loader2, FileText, Receipt, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  requestId: string
  workOrderNumber: string
  token: string
  currentStatus: string
}

interface LineItem {
  description: string
  amount_cents: number
}

const STATUS_LABELS: Record<string, string> = {
  work_order_sent: "Work order received",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_completion: "Awaiting sign-off",
  completed: "Completed",
  closed: "Closed",
}

// ─── Quote panel ─────────────────────────────────────────────────────────────

function QuotePanel({ requestId, workOrderNumber, token, onSubmitted }: {
  requestId: string
  workOrderNumber: string
  token: string
  onSubmitted: () => void
}) {
  const [quoteType, setQuoteType] = useState<"quote" | "estimate">("quote")
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", amount_cents: 0 }])
  const [vatRate, setVatRate] = useState<15 | 0>(15)
  const [scopeOfWork, setScopeOfWork] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function updateLine(index: number, field: keyof LineItem, value: string) {
    setLineItems((prev) => prev.map((item, i) =>
      i === index
        ? { ...item, [field]: field === "amount_cents" ? Math.round(Number.parseFloat(value || "0") * 100) : value }
        : item
    ))
  }

  function addLine() {
    setLineItems((prev) => [...prev, { description: "", amount_cents: 0 }])
  }

  function removeLine(index: number) {
    if (lineItems.length === 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amount_cents, 0)
  const vatCents = vatRate === 15 ? Math.round(subtotalCents * 0.15) : 0
  const totalCents = subtotalCents + vatCents

  const canSubmit = lineItems.every((item) => item.description.trim() && item.amount_cents > 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/wo/${workOrderNumber}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          token,
          quote_type: quoteType,
          line_items: lineItems,
          subtotal_excl_vat_cents: subtotalCents,
          vat_amount_cents: vatCents,
          total_incl_vat_cents: totalCents,
          scope_of_work: scopeOfWork || undefined,
        }),
      })
      if (!res.ok) {
        toast.error("Could not submit quote — please try again")
        return
      }
      toast.success("Quote submitted")
      onSubmitted()
    } catch {
      toast.error("Could not submit quote — please check your connection")
    } finally {
      setSubmitting(false)
    }
  }

  function formatZAR(cents: number) {
    return `R ${(cents / 100).toFixed(2)}`
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-surface-elevated px-5 py-4 space-y-4">
      <p className="text-sm font-semibold">Submit quote</p>

      {/* Quote type */}
      <div className="flex gap-2">
        {(["quote", "estimate"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setQuoteType(t)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              quoteType === t
                ? "border-brand bg-brand/10 text-brand"
                : "border-border/60 text-muted-foreground hover:border-border"
            }`}
          >
            {t === "quote" ? "Fixed quote" : "Estimate"}
          </button>
        ))}
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <Label className="text-xs">Line items</Label>
        {lineItems.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Input
              value={item.description}
              onChange={(e) => updateLine(i, "description", e.target.value)}
              placeholder="Description"
              className="text-sm flex-1"
            />
            <div className="relative w-28 shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.amount_cents > 0 ? (item.amount_cents / 100).toFixed(2) : ""}
                onChange={(e) => updateLine(i, "amount_cents", e.target.value)}
                placeholder="0.00"
                className="text-sm pl-6"
              />
            </div>
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lineItems.length === 1}
              className="mt-2 text-muted-foreground hover:text-danger disabled:opacity-30 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add line
        </button>
      </div>

      {/* VAT toggle */}
      <div className="flex items-center gap-3">
        <Label className="text-xs">VAT</Label>
        <div className="flex gap-2">
          {([15, 0] as const).map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => setVatRate(rate)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                vatRate === rate
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border/60 text-muted-foreground hover:border-border"
              }`}
            >
              {rate === 15 ? "15% VAT" : "VAT exempt"}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-lg bg-muted/30 px-4 py-3 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal excl. VAT</span>
          <span>{formatZAR(subtotalCents)}</span>
        </div>
        {vatCents > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>VAT (15%)</span>
            <span>{formatZAR(vatCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold pt-1 border-t border-border/40">
          <span>Total</span>
          <span>{formatZAR(totalCents)}</span>
        </div>
      </div>

      {/* Scope (optional) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Scope of work (optional)</Label>
        <Textarea
          value={scopeOfWork}
          onChange={(e) => setScopeOfWork(e.target.value)}
          rows={2}
          placeholder="Briefly describe what the quote covers…"
          className="resize-none text-sm"
        />
      </div>

      <Button
        type="button"
        size="sm"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Submit quote
      </Button>
    </div>
  )
}

// ─── Invoice panel ────────────────────────────────────────────────────────────

function InvoicePanel({ requestId, workOrderNumber, token, onSubmitted }: {
  requestId: string
  workOrderNumber: string
  token: string
  onSubmitted: () => void
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState("")
  const [amountExclStr, setAmountExclStr] = useState("")
  const [vatRate, setVatRate] = useState<15 | 0>(15)
  const [submitting, setSubmitting] = useState(false)

  const amountExclCents = Math.round(Number.parseFloat(amountExclStr || "0") * 100)
  const vatCents = vatRate === 15 ? Math.round(amountExclCents * 0.15) : 0
  const totalCents = amountExclCents + vatCents

  const canSubmit = description.trim() && amountExclStr && amountExclCents > 0 && invoiceDate

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/wo/${workOrderNumber}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          token,
          invoice_number: invoiceNumber || undefined,
          invoice_date: invoiceDate,
          description,
          amount_excl_vat_cents: amountExclCents,
          vat_amount_cents: vatCents,
          amount_incl_vat_cents: totalCents,
        }),
      })
      if (!res.ok) {
        toast.error("Could not submit invoice — please try again")
        return
      }
      toast.success("Invoice submitted")
      onSubmitted()
    } catch {
      toast.error("Could not submit invoice — please check your connection")
    } finally {
      setSubmitting(false)
    }
  }

  function formatZAR(cents: number) {
    return `R ${(cents / 100).toFixed(2)}`
  }

  return (
    <div className="rounded-xl border border-success/30 bg-surface-elevated px-5 py-4 space-y-4">
      <p className="text-sm font-semibold">Submit invoice</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice number (optional)</Label>
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-001"
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice date *</Label>
          <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} placeholder="Invoice date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description *</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="e.g. Replaced burst geyser element and pressure valve"
          className="resize-none text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Amount excl. VAT (R) *</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amountExclStr}
            onChange={(e) => setAmountExclStr(e.target.value)}
            placeholder="0.00"
            className="text-sm pl-6"
          />
        </div>
      </div>

      {/* VAT toggle */}
      <div className="flex items-center gap-3">
        <Label className="text-xs">VAT</Label>
        <div className="flex gap-2">
          {([15, 0] as const).map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => setVatRate(rate)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                vatRate === rate
                  ? "border-success bg-success/10 text-success"
                  : "border-border/60 text-muted-foreground hover:border-border"
              }`}
            >
              {rate === 15 ? "15% VAT" : "VAT exempt"}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      {amountExclCents > 0 && (
        <div className="rounded-lg bg-muted/30 px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Excl. VAT</span>
            <span>{formatZAR(amountExclCents)}</span>
          </div>
          {vatCents > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>VAT (15%)</span>
              <span>{formatZAR(vatCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold pt-1 border-t border-border/40">
            <span>Total incl. VAT</span>
            <span>{formatZAR(totalCents)}</span>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="sm"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Submit invoice
      </Button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContractorTrackingClient({ requestId, workOrderNumber, token, currentStatus: initialStatus }: Readonly<Props>) {
  const [status, setStatus] = useState(initialStatus)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [completionNotes, setCompletionNotes] = useState("")
  const [actualCost, setActualCost] = useState("")
  const [rescheduleReason, setRescheduleReason] = useState("")
  const [declineReason, setDeclineReason] = useState("")
  const [showCompletion, setShowCompletion] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [showQuote, setShowQuote] = useState(false)
  const [quoteSubmitted, setQuoteSubmitted] = useState(false)
  const [completionDone, setCompletionDone] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceSubmitted, setInvoiceSubmitted] = useState(false)

  async function postUpdate(newStatus: string, payload: Record<string, string> = {}) {
    setSubmitting(newStatus)
    try {
      const res = await fetch(`/api/wo/${workOrderNumber}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, token, new_status: newStatus, ...payload }),
      })
      if (!res.ok) {
        toast.error("Could not update status — please try again")
        return
      }
      setStatus(newStatus)
      if (newStatus === "pending_completion") setCompletionDone(true)
    } catch {
      toast.error("Could not update status — please check your connection")
    } finally {
      setSubmitting(null)
    }
  }

  const isTerminal = ["completed", "closed", "cancelled", "rejected"].includes(status)

  // After completion report submitted — show invoice prompt
  if (completionDone) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-6 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
          <p className="font-semibold text-lg">Completion report submitted</p>
          <p className="text-sm text-muted-foreground">The property manager has been notified and will sign off on the job.</p>
        </div>

        {invoiceSubmitted && (
          <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm font-medium">Invoice submitted — the agent will process payment.</p>
          </div>
        )}
        {!invoiceSubmitted && showInvoice && (
          <InvoicePanel
            requestId={requestId}
            workOrderNumber={workOrderNumber}
            token={token}
            onSubmitted={() => { setShowInvoice(false); setInvoiceSubmitted(true) }}
          />
        )}
        {!invoiceSubmitted && !showInvoice && (
          <button
            type="button"
            onClick={() => setShowInvoice(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <Receipt className="h-4 w-4" />
            Submit invoice for this job
          </button>
        )}
      </div>
    )
  }

  if (isTerminal) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 text-center">
        <p className="text-sm text-muted-foreground">This job is {status.replaceAll("_", " ")}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-0.5">Current status</p>
        <p className="text-sm font-medium">{STATUS_LABELS[status] ?? status.replaceAll("_", " ")}</p>
      </div>

      {/* Quote — shown when work_order_sent and not yet submitted */}
      {status === "work_order_sent" && !quoteSubmitted && !showQuote && (
        <button
          type="button"
          onClick={() => setShowQuote(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <FileText className="h-4 w-4" />
          Submit a quote first
        </button>
      )}
      {quoteSubmitted && (
        <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <p className="text-sm text-success font-medium">Quote submitted</p>
        </div>
      )}
      {showQuote && (
        <QuotePanel
          requestId={requestId}
          workOrderNumber={workOrderNumber}
          token={token}
          onSubmitted={() => { setShowQuote(false); setQuoteSubmitted(true) }}
        />
      )}

      {/* Acknowledge — shown if work_order_sent */}
      {status === "work_order_sent" && (
        <button
          type="button"
          disabled={!!submitting}
          onClick={() => postUpdate("acknowledged")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-brand bg-brand/5 px-5 py-4 text-sm font-semibold text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
        >
          {submitting === "acknowledged" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          I&apos;ve received this — confirm
        </button>
      )}

      {/* On my way / starting work — shown if acknowledged */}
      {status === "acknowledged" && (
        <button
          type="button"
          disabled={!!submitting}
          onClick={() => postUpdate("in_progress")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-info bg-info/5 px-5 py-4 text-sm font-semibold text-info hover:bg-info/10 transition-colors disabled:opacity-50"
        >
          {submitting === "in_progress" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-5 w-5" />}
          On my way / starting work
        </button>
      )}

      {/* Complete — shown if in_progress or acknowledged */}
      {(status === "in_progress" || status === "acknowledged") && !showCompletion && (
        <button
          type="button"
          onClick={() => setShowCompletion(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-success bg-success/5 px-5 py-4 text-sm font-semibold text-success hover:bg-success/10 transition-colors"
        >
          <ClipboardCheck className="h-5 w-5" />
          Work complete — submit report
        </button>
      )}

      {showCompletion && (
        <div className="rounded-xl border border-success/30 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-semibold">Completion report</p>
          <div className="space-y-1.5">
            <Label className="text-xs">What was done *</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="Describe what was repaired or replaced…"
              className="resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Total cost incl. VAT (R)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              placeholder="0.00"
              className="text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!completionNotes.trim() || !!submitting}
              onClick={() => postUpdate("pending_completion", {
                completion_notes: completionNotes,
                actual_cost: actualCost,
              })}
            >
              {submitting === "pending_completion" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Submit report
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCompletion(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Reschedule */}
      {!showReschedule && !showDecline && (
        <button
          type="button"
          onClick={() => setShowReschedule(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <Calendar className="h-4.5 w-4.5" />
          Need to reschedule
        </button>
      )}
      {showReschedule && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Reschedule reason</p>
          <Textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            rows={2}
            placeholder="e.g. Part on back order — available Friday"
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!rescheduleReason.trim() || !!submitting}
              onClick={() => postUpdate("acknowledged", { reschedule_notes: rescheduleReason })}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Notify agent
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowReschedule(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Decline */}
      {!showReschedule && !showDecline && (
        <button
          type="button"
          onClick={() => setShowDecline(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-danger hover:border-danger/30 transition-colors"
        >
          <XCircle className="h-4.5 w-4.5" />
          Cannot complete — please reassign
        </button>
      )}
      {showDecline && (
        <div className="rounded-xl border border-danger/20 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Reason for declining</p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={2}
            placeholder="e.g. Outside our speciality — recommend a structural engineer"
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!declineReason.trim() || !!submitting}
              onClick={() => postUpdate("approved", { decline_notes: declineReason })}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Decline job
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDecline(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
