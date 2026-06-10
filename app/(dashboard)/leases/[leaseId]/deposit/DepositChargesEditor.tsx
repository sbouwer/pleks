"use client"

/**
 * app/(dashboard)/leases/[leaseId]/deposit/DepositChargesEditor.tsx — add/confirm non-damage deposit charges
 *
 * Route:  /leases/[leaseId]/deposit
 * Auth:   Agent session (gateway via server actions)
 * Data:   deposit_charges via createDepositCharge, confirmDepositCharge, deleteDepositCharge
 * Notes:  ADDENDUM_63B. Shows existing charges + discovery suggestions from open arrears cases
 *         and unpaid invoices. Each suggestion pre-populates the add form when clicked.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { formatZAR } from "@/lib/constants"
import {
  createDepositCharge,
  confirmDepositCharge,
  deleteDepositCharge,
} from "@/lib/actions/deposits"

export interface DepositCharge {
  id: string
  charge_type: string
  description: string
  deduction_amount_cents: number
  agent_confirmed: boolean
  source_arrears_case_id: string | null
  source_invoice_id: string | null
  source_supplier_invoice_id: string | null
  source_municipal_bill_id: string | null
  source_lease_charge_id: string | null
  notes: string | null
}

export interface ArrearssuggestionItem {
  arrears_case_id: string
  label: string
  amount_cents: number
}

export interface InvoiceSuggestionItem {
  invoice_id: string
  label: string
  amount_cents: number
}

const CHARGE_TYPE_OPTIONS = [
  { value: "rent_arrears",          label: "Rent Arrears" },
  { value: "unpaid_utilities",      label: "Unpaid Utilities" },
  { value: "cleaning",              label: "Cleaning" },
  { value: "contractual_penalty",   label: "Contractual Penalty" },
  { value: "lock_replacement",      label: "Lock Replacement" },
  { value: "key_replacement",       label: "Key Replacement" },
  { value: "admin_fee",             label: "Administration Fee" },
  { value: "dilapidation",          label: "Dilapidation" },
  { value: "fittings_removal",      label: "Fittings Removal" },
  { value: "early_termination_fee", label: "Early Termination Fee" },
  { value: "other",                 label: "Other" },
]

interface FormState {
  charge_type: string
  description: string
  deduction_amount_cents: string
  justification: string
  source_arrears_case_id: string
  source_invoice_id: string
  notes: string
}

const EMPTY_FORM: FormState = {
  charge_type:            "other",
  description:            "",
  deduction_amount_cents: "",
  justification:          "",
  source_arrears_case_id: "",
  source_invoice_id:      "",
  notes:                  "",
}

interface DepositChargesEditorProps {
  leaseId: string
  charges: DepositCharge[]
  arrearsSuggestions: ArrearssuggestionItem[]
  invoiceSuggestions: InvoiceSuggestionItem[]
  reconStatus: string
}

export function DepositChargesEditor({
  leaseId,
  charges,
  arrearsSuggestions,
  invoiceSuggestions,
  reconStatus,
}: DepositChargesEditorProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const isLocked = reconStatus === "refunded"
  const confirmedCount = charges.filter((c) => c.agent_confirmed).length
  const unconfirmedCount = charges.length - confirmedCount

  function prefillFromArrears(s: ArrearssuggestionItem) {
    setForm({
      ...EMPTY_FORM,
      charge_type:            "rent_arrears",
      description:            `Outstanding rent — ${s.label}`,
      deduction_amount_cents: String(s.amount_cents / 100),
      source_arrears_case_id: s.arrears_case_id,
    })
    setShowForm(true)
  }

  function prefillFromInvoice(s: InvoiceSuggestionItem) {
    setForm({
      ...EMPTY_FORM,
      charge_type:            "rent_arrears",
      description:            `Unpaid invoice — ${s.label}`,
      deduction_amount_cents: String(s.amount_cents / 100),
      source_invoice_id:      s.invoice_id,
    })
    setShowForm(true)
  }

  async function handleSave() {
    const amountRand = parseFloat(form.deduction_amount_cents)
    if (!form.description.trim()) { toast.error("Description is required"); return }
    if (isNaN(amountRand) || amountRand <= 0) { toast.error("Enter a valid positive amount"); return }

    setSaving(true)
    const result = await createDepositCharge(leaseId, {
      charge_type:            form.charge_type,
      description:            form.description.trim(),
      deduction_amount_cents: Math.round(amountRand * 100),
      justification:          form.justification.trim() || undefined,
      source_arrears_case_id: form.source_arrears_case_id || undefined,
      source_invoice_id:      form.source_invoice_id || undefined,
      notes:                  form.notes.trim() || undefined,
    })
    setSaving(false)

    if ("error" in result) { toast.error(result.error); return }
    toast.success("Charge added")
    setForm(EMPTY_FORM)
    setShowForm(false)
    router.refresh()
  }

  async function handleConfirm(chargeId: string) {
    const result = await confirmDepositCharge(chargeId, leaseId)
    if ("error" in result) toast.error(result.error)
    else { toast.success("Charge confirmed"); router.refresh() }
  }

  async function handleDelete(chargeId: string) {
    if (!confirm("Remove this charge?")) return
    const result = await deleteDepositCharge(chargeId, leaseId)
    if ("error" in result) toast.error(result.error)
    else { toast.success("Charge removed"); router.refresh() }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Non-Damage Charges</CardTitle>
          {unconfirmedCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">{unconfirmedCount} charge{unconfirmedCount > 1 ? "s" : ""} awaiting confirmation</p>
          )}
        </div>
        {!isLocked && !showForm && (
          <ActionButton tone="secondary" onClick={() => setShowForm(true)}>
            Add charge
          </ActionButton>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Discovery suggestions — arrears cases */}
        {arrearsSuggestions.length > 0 && !isLocked && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700">Unsettled arrears found — add as deposit charge?</p>
            {arrearsSuggestions.map((s) => (
              <div key={s.arrears_case_id} className="flex items-center justify-between text-xs">
                <span className="text-amber-800">{s.label} — {formatZAR(s.amount_cents)}</span>
                <button
                  onClick={() => prefillFromArrears(s)}
                  className="text-amber-700 underline hover:text-amber-900 ml-2"
                >
                  Add charge
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Discovery suggestions — open invoices */}
        {invoiceSuggestions.length > 0 && !isLocked && (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-orange-700">Unpaid invoices found — add as deposit charge?</p>
            {invoiceSuggestions.map((s) => (
              <div key={s.invoice_id} className="flex items-center justify-between text-xs">
                <span className="text-orange-800">{s.label} — {formatZAR(s.amount_cents)}</span>
                <button
                  onClick={() => prefillFromInvoice(s)}
                  className="text-orange-700 underline hover:text-orange-900 ml-2"
                >
                  Add charge
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add charge form */}
        {showForm && !isLocked && (
          <div className="rounded-md border border-border p-4 space-y-3 bg-muted/30">
            <p className="text-xs font-semibold">New charge</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select
                  value={form.charge_type}
                  onChange={(e) => setForm((f) => ({ ...f, charge_type: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                >
                  {CHARGE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Amount (R)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.deduction_amount_cents}
                  onChange={(e) => setForm((f) => ({ ...f, deduction_amount_cents: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1.5 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. Outstanding rent for April 2026"
              />
            </div>
            {!form.source_arrears_case_id && !form.source_invoice_id && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Reason (required — appears on the tenant&apos;s deposit schedule)</label>
                <textarea
                  value={form.justification}
                  onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                  className="w-full border rounded-md px-2 py-1.5 text-sm min-h-[3rem]"
                  placeholder="Why is this an ad-hoc deduction? (RHA s5 — each deduction needs a reason)"
                />
              </div>
            )}
            {form.source_arrears_case_id && (
              <p className="text-xs text-muted-foreground">Linked to arrears case: {form.source_arrears_case_id.slice(0, 8).toUpperCase()}</p>
            )}
            {form.source_invoice_id && (
              <p className="text-xs text-muted-foreground">Linked to invoice: {form.source_invoice_id.slice(0, 8).toUpperCase()}</p>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. Lease clause 14.2 — 2 months penalty"
              />
            </div>
            <div className="flex gap-2">
              <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save charge"}
              </ActionButton>
              <ActionButton tone="secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}>
                Cancel
              </ActionButton>
            </div>
          </div>
        )}

        {/* Existing charges list */}
        {charges.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No non-damage charges added.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-2">Type</th>
                <th className="text-left py-2 pr-2">Description</th>
                <th className="text-right py-2 px-2">Amount</th>
                <th className="text-center py-2">Status</th>
                {!isLocked && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr key={charge.id} className="border-b border-border/50">
                  <td className="py-2 pr-2 text-xs capitalize text-muted-foreground">
                    {charge.charge_type.replace(/_/g, " ")}
                  </td>
                  <td className="py-2 pr-2">
                    {charge.description}
                    {charge.notes && <p className="text-xs text-muted-foreground">{charge.notes}</p>}
                  </td>
                  <td className="text-right py-2 px-2 font-semibold">
                    {formatZAR(charge.deduction_amount_cents)}
                  </td>
                  <td className="text-center py-2">
                    {charge.agent_confirmed
                      ? <Badge className="bg-green-100 text-green-700 text-xs">Confirmed</Badge>
                      : <Badge variant="secondary" className="text-xs">Pending</Badge>
                    }
                  </td>
                  {!isLocked && (
                    <td className="py-2 pl-2">
                      <div className="flex gap-1 justify-end">
                        {!charge.agent_confirmed && (
                          <button
                            onClick={() => handleConfirm(charge.id)}
                            className="text-xs text-green-700 hover:underline"
                          >
                            Confirm
                          </button>
                        )}
                        {!charge.agent_confirmed && (
                          <button
                            onClick={() => handleDelete(charge.id)}
                            className="text-xs text-red-600 hover:underline ml-2"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2} className="pt-2 text-xs">Total confirmed charges</td>
                <td className="text-right pt-2">
                  {formatZAR(charges.filter((c) => c.agent_confirmed).reduce((s, c) => s + c.deduction_amount_cents, 0))}
                </td>
                <td colSpan={!isLocked ? 2 : 1}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
