"use client"

/**
 * components/leases/steps/details/ChargesSection.tsx — the "Charges" section of the merged Lease-details step
 *
 * Auth:   client-only; pure form section (no DB access)
 * Data:   controlled by parent via charges/onceOffCharges + change callbacks
 * Notes:  Lifted from the old ChargesStep, stripped of its own step-nav. Recurring + once-off charge editors.
 */
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
    <div className="rounded-[var(--r-button)] border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">New recurring charge</span>
        <button type="button" onClick={onCancel}><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Charge type</Label>
          <Select value={chargeType} onValueChange={(v) => handleTypeChange(v ?? "other")}>
            <SelectTrigger><SelectValue>{CHARGE_TYPES.find((t) => t.value === chargeType)?.label}</SelectValue></SelectTrigger>
            <SelectContent>{CHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount/month (ZAR) *</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description *</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start date</Label>
          <DatePickerInput value={startDate} onChange={setStartDate} placeholder="Start date" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End date (optional)</Label>
          <DatePickerInput value={endDate} onChange={setEndDate} placeholder="End date" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Payable to</Label>
        <Select value={payableTo} onValueChange={(v) => setPayableTo(v ?? "landlord")}>
          <SelectTrigger><SelectValue>{PAYABLE_TO.find((p) => p.value === payableTo)?.label}</SelectValue></SelectTrigger>
          <SelectContent>{PAYABLE_TO.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" checked={deductFromOwner} onChange={(e) => setDeductFromOwner(e.target.checked)} className="accent-primary" />
        Deduct from owner payment
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!description.trim() || !amount}>Add</Button>
      </div>
    </div>
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
    <div className="rounded-[var(--r-button)] border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">New once-off charge</span>
        <button type="button" onClick={onCancel}><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Charge type</Label>
          <Select value={chargeType} onValueChange={(v) => handleTypeChange(v ?? "contract_fee")}>
            <SelectTrigger><SelectValue>{ONCE_OFF_CHARGE_TYPES.find((t) => t.value === chargeType)?.label}</SelectValue></SelectTrigger>
            <SelectContent>{ONCE_OFF_CHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount (ZAR) *</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description *</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Payable to</Label>
        <Select value={payableTo} onValueChange={(v) => setPayableTo(v ?? "agent")}>
          <SelectTrigger><SelectValue>{PAYABLE_TO.find((p) => p.value === payableTo)?.label}</SelectValue></SelectTrigger>
          <SelectContent>{PAYABLE_TO.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!description.trim() || !amount}>Add</Button>
      </div>
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
          <Button size="sm" variant="outline" onClick={() => setShowAddCharge(true)}>
            <Plus className="size-4 mr-1" /> Add charge
          </Button>
        </div>

        {charges.length > 0 ? (
          <div className="space-y-2">
            {charges.map((c) => (
              <div key={c.id} className="flex items-start justify-between rounded-[var(--r-button)] border border-border/60 bg-surface-elevated px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.description}</span>
                    <Badge variant="secondary" className="text-[10px]">{payableLabel(c.payable_to)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatZAR(c.amount_cents)}/mo · from {c.start_date}{c.end_date ? ` to ${c.end_date}` : ""}
                  </p>
                  {c.deduct_from_owner_payment && <p className="text-xs text-amber-500">Deducted from owner payment</p>}
                </div>
                <button type="button" className="text-muted-foreground hover:text-danger ml-2" onClick={() => onChangeCharges(charges.filter((x) => x.id !== c.id))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
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
          <Button size="sm" variant="outline" onClick={() => setShowAddOnceOff(true)}>
            <Plus className="size-4 mr-1" /> Add charge
          </Button>
        </div>

        {onceOffCharges.length > 0 ? (
          <div className="space-y-2">
            {onceOffCharges.map((c) => (
              <div key={c.id} className="flex items-start justify-between rounded-[var(--r-button)] border border-border/60 bg-surface-elevated px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.description}</span>
                    <Badge variant="secondary" className="text-[10px]">Once-off</Badge>
                    <Badge variant="outline" className="text-[10px]">{payableLabel(c.payable_to)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatZAR(c.amount_cents)}</p>
                </div>
                <button type="button" className="text-muted-foreground hover:text-danger ml-2" onClick={() => onChangeOnceOff(onceOffCharges.filter((x) => x.id !== c.id))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
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
