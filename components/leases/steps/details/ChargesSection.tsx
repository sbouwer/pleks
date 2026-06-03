"use client"

/**
 * components/leases/steps/details/ChargesSection.tsx — the "Charges" step of the lease modal
 *
 * Auth:   client-only; pure form section (no DB access)
 * Data:   controlled by parent via charges/onceOffCharges + change callbacks
 * Notes:  Door-card grammar (underline fields, square cards, dashed add-buttons — matches the add-party modal).
 *         Recurring + once-off charge editors.
 */
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Field, UnderlineInput, UnderlineSelect, DashedAddButton } from "@/components/ui/door-form"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import type { LocalCharge, LocalOnceOffCharge } from "../../wizardData"

const CHARGE_TYPES = [
  { value: "body_corporate_levy", label: "Body corporate levy" },
  { value: "special_levy", label: "Special levy" },
  { value: "parking", label: "Parking" },
  { value: "water_flat_rate", label: "Water (flat rate)" },
  { value: "electricity_flat_rate", label: "Electricity (flat rate)" },
  { value: "garden_service", label: "Garden service" },
  { value: "security", label: "Security" },
  { value: "internet", label: "Internet" },
  { value: "other", label: "Other" },
]

const ONCE_OFF_CHARGE_TYPES = [
  { value: "contract_fee", label: "Contract / admin fee" },
  { value: "inspection_fee", label: "Inspection fee" },
  { value: "key_deposit", label: "Key deposit" },
  { value: "cleaning_fee", label: "Cleaning fee" },
  { value: "other", label: "Other" },
]

const PAYABLE_TO = [
  { value: "landlord", label: "Landlord" },
  { value: "body_corporate", label: "Body corporate" },
  { value: "agent", label: "Agent (retained)" },
  { value: "third_party", label: "Third-party vendor" },
]

interface Props {
  charges: LocalCharge[]
  onceOffCharges: LocalOnceOffCharge[]
  onChangeCharges: (next: LocalCharge[]) => void
  onChangeOnceOff: (next: LocalOnceOffCharge[]) => void
}

function newId() {
  return crypto.randomUUID()
}

function getDefaultsForType(chargeType: string) {
  if (chargeType === "body_corporate_levy" || chargeType === "special_levy") {
    return { payableTo: "body_corporate", deductFromOwner: true }
  }
  return { payableTo: "landlord", deductFromOwner: false }
}

function payableLabel(payableTo: string): string | undefined {
  return PAYABLE_TO.find((p) => p.value === payableTo)?.label?.split(" ")[0]
}

/** Square "door" card for a new-charge sub-form (primary-tinted, matches the party add cards). */
function FormCard({ title, onCancel, children }: Readonly<{ title: string; onCancel: () => void; children: React.ReactNode }>) {
  return (
    <div className="space-y-3 rounded-[var(--r-button)] border border-primary/30 bg-primary/[0.03] p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
        <button type="button" onClick={onCancel} aria-label="Cancel"><X className="size-4 text-muted-foreground hover:text-foreground" /></button>
      </div>
      {children}
    </div>
  )
}

function RecurringForm({ onAdd, onCancel }: Readonly<{ onAdd: (c: LocalCharge) => void; onCancel: () => void }>) {
  const [description, setDescription] = useState("")
  const [chargeType, setChargeType] = useState("other")
  const [amount, setAmount] = useState("")
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState("")
  const [payableTo, setPayableTo] = useState("landlord")
  const [deductFromOwner, setDeductFromOwner] = useState(false)

  function handleTypeChange(type: string) {
    setChargeType(type)
    const defaults = getDefaultsForType(type)
    setPayableTo(defaults.payableTo)
    setDeductFromOwner(defaults.deductFromOwner)
    if (!description) setDescription(CHARGE_TYPES.find((t) => t.value === type)?.label ?? "")
  }

  function handleAdd() {
    if (!description.trim() || !amount) return
    onAdd({
      id: newId(),
      description: description.trim(),
      charge_type: chargeType,
      amount_cents: Math.round(Number.parseFloat(amount) * 100),
      start_date: startDate,
      end_date: endDate || null,
      payable_to: payableTo,
      deduct_from_owner_payment: deductFromOwner,
    })
  }

  return (
    <FormCard title="New recurring charge" onCancel={onCancel}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Charge type">
          <UnderlineSelect value={chargeType} onChange={(v) => handleTypeChange(v || "other")} options={CHARGE_TYPES} />
        </Field>
        <Field label="Amount/month (ZAR)" required>
          <UnderlineInput type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Description" required span>
          <UnderlineInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Start date">
          <DatePickerInput value={startDate} onChange={setStartDate} placeholder="Start date" />
        </Field>
        <Field label="End date (optional)">
          <DatePickerInput value={endDate} onChange={setEndDate} placeholder="End date" />
        </Field>
        <Field label="Payable to" span>
          <UnderlineSelect value={payableTo} onChange={(v) => setPayableTo(v || "landlord")} options={PAYABLE_TO} />
        </Field>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" checked={deductFromOwner} onChange={(e) => setDeductFromOwner(e.target.checked)} className="accent-primary" />
        Deduct from owner payment
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!description.trim() || !amount}>Add</Button>
      </div>
    </FormCard>
  )
}

function OnceOffForm({ onAdd, onCancel }: Readonly<{ onAdd: (c: LocalOnceOffCharge) => void; onCancel: () => void }>) {
  const [description, setDescription] = useState("")
  const [chargeType, setChargeType] = useState("contract_fee")
  const [amount, setAmount] = useState("")
  const [payableTo, setPayableTo] = useState("agent")

  function handleTypeChange(type: string) {
    setChargeType(type)
    if (!description) setDescription(ONCE_OFF_CHARGE_TYPES.find((t) => t.value === type)?.label ?? "")
  }

  function handleAdd() {
    if (!description.trim() || !amount) return
    onAdd({
      id: newId(),
      description: description.trim(),
      charge_type: chargeType,
      amount_cents: Math.round(Number.parseFloat(amount) * 100),
      payable_to: payableTo,
    })
  }

  return (
    <FormCard title="New once-off charge" onCancel={onCancel}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Charge type">
          <UnderlineSelect value={chargeType} onChange={(v) => handleTypeChange(v || "contract_fee")} options={ONCE_OFF_CHARGE_TYPES} />
        </Field>
        <Field label="Amount (ZAR)" required>
          <UnderlineInput type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Description" required span>
          <UnderlineInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Payable to" span>
          <UnderlineSelect value={payableTo} onChange={(v) => setPayableTo(v || "agent")} options={PAYABLE_TO} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!description.trim() || !amount}>Add</Button>
      </div>
    </FormCard>
  )
}

function ChargeRow({ children, onRemove }: Readonly<{ children: React.ReactNode; onRemove: () => void }>) {
  return (
    <div className="flex items-start justify-between rounded-[var(--r-button)] border border-border bg-muted/20 px-3 py-2.5">
      <div>{children}</div>
      <button type="button" className="ml-2 text-muted-foreground hover:text-danger" onClick={onRemove}>
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

export function ChargesSection({ charges, onceOffCharges, onChangeCharges, onChangeOnceOff }: Readonly<Props>) {
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [showAddOnceOff, setShowAddOnceOff] = useState(false)

  const totalCharges = charges.reduce((s, c) => s + c.amount_cents, 0)

  return (
    <div className="space-y-8">
      {/* Recurring charges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Recurring charges</h4>
            {totalCharges > 0 && <p className="text-xs text-muted-foreground">{formatZAR(totalCharges)}/month in additional charges</p>}
          </div>
          {!showAddCharge && <DashedAddButton onClick={() => setShowAddCharge(true)}><Plus className="size-4" /> Add charge</DashedAddButton>}
        </div>

        {charges.length > 0 ? (
          <div className="space-y-2">
            {charges.map((c) => (
              <ChargeRow key={c.id} onRemove={() => onChangeCharges(charges.filter((x) => x.id !== c.id))}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.description}</span>
                  <Badge variant="secondary" className="text-[10px]">{payableLabel(c.payable_to)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatZAR(c.amount_cents)}/mo · from {c.start_date}{c.end_date ? ` to ${c.end_date}` : ""}
                </p>
                {c.deduct_from_owner_payment && <p className="text-xs text-amber-500">Deducted from owner payment</p>}
              </ChargeRow>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recurring charges added.</p>
        )}

        {showAddCharge && (
          <RecurringForm
            onAdd={(c) => { onChangeCharges([...charges, c]); setShowAddCharge(false) }}
            onCancel={() => setShowAddCharge(false)}
          />
        )}
      </div>

      {/* Once-off charges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Once-off charges</h4>
            <p className="text-xs text-muted-foreground">Contract fees, inspection fees, key deposits, etc.</p>
          </div>
          {!showAddOnceOff && <DashedAddButton onClick={() => setShowAddOnceOff(true)}><Plus className="size-4" /> Add charge</DashedAddButton>}
        </div>

        {onceOffCharges.length > 0 ? (
          <div className="space-y-2">
            {onceOffCharges.map((c) => (
              <ChargeRow key={c.id} onRemove={() => onChangeOnceOff(onceOffCharges.filter((x) => x.id !== c.id))}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.description}</span>
                  <Badge variant="secondary" className="text-[10px]">Once-off</Badge>
                  <Badge variant="outline" className="text-[10px]">{payableLabel(c.payable_to)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatZAR(c.amount_cents)}</p>
              </ChargeRow>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No once-off charges added.</p>
        )}

        {showAddOnceOff && (
          <OnceOffForm
            onAdd={(c) => { onChangeOnceOff([...onceOffCharges, c]); setShowAddOnceOff(false) }}
            onCancel={() => setShowAddOnceOff(false)}
          />
        )}
      </div>
    </div>
  )
}
