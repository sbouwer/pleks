"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, X } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import type { WizardData, LocalCharge, LocalOnceOffCharge } from "../LeaseWizard"

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
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

function newId() {
  return Math.random().toString(36).slice(2)
}

function getDefaultsForType(chargeType: string) {
  if (chargeType === "body_corporate_levy" || chargeType === "special_levy") {
    return { payableTo: "body_corporate", deductFromOwner: true }
  }
  return { payableTo: "landlord", deductFromOwner: false }
}

export function ChargesStep({ data, onBack, onNext }: Readonly<Props>) {
  const [charges, setCharges] = useState<LocalCharge[]>(data.charges)
  const [onceOffCharges, setOnceOffCharges] = useState<LocalOnceOffCharge[]>(data.onceOffCharges)
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [showAddOnceOff, setShowAddOnceOff] = useState(false)

  // Recurring charge form state
  const [newDescription, setNewDescription] = useState("")
  const [newChargeType, setNewChargeType] = useState("other")
  const [newAmount, setNewAmount] = useState("")
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [newEndDate, setNewEndDate] = useState("")
  const [newPayableTo, setNewPayableTo] = useState("landlord")
  const [newDeductFromOwner, setNewDeductFromOwner] = useState(false)

  // Once-off charge form state
  const [ooDescription, setOoDescription] = useState("")
  const [ooChargeType, setOoChargeType] = useState("contract_fee")
  const [ooAmount, setOoAmount] = useState("")
  const [ooPayableTo, setOoPayableTo] = useState("agent")

  function handleTypeChange(type: string) {
    setNewChargeType(type)
    const defaults = getDefaultsForType(type)
    setNewPayableTo(defaults.payableTo)
    setNewDeductFromOwner(defaults.deductFromOwner)
    if (!newDescription) {
      const label = CHARGE_TYPES.find((t) => t.value === type)?.label ?? ""
      setNewDescription(label)
    }
  }

  function addCharge() {
    if (!newDescription.trim() || !newAmount) return
    const charge: LocalCharge = {
      id: newId(),
      description: newDescription.trim(),
      charge_type: newChargeType,
      amount_cents: Math.round(Number.parseFloat(newAmount) * 100),
      start_date: newStartDate,
      end_date: newEndDate || null,
      payable_to: newPayableTo,
      deduct_from_owner_payment: newDeductFromOwner,
    }
    setCharges((prev) => [...prev, charge])
    setNewDescription("")
    setNewChargeType("other")
    setNewAmount("")
    setNewStartDate(new Date().toISOString().slice(0, 10))
    setNewEndDate("")
    setNewPayableTo("landlord")
    setNewDeductFromOwner(false)
    setShowAddCharge(false)
  }

  function removeCharge(id: string) {
    setCharges((prev) => prev.filter((c) => c.id !== id))
  }

  function handleOoTypeChange(type: string) {
    setOoChargeType(type)
    if (!ooDescription) {
      const label = ONCE_OFF_CHARGE_TYPES.find((t) => t.value === type)?.label ?? ""
      setOoDescription(label)
    }
  }

  function addOnceOffCharge() {
    if (!ooDescription.trim() || !ooAmount) return
    const charge: LocalOnceOffCharge = {
      id: newId(),
      description: ooDescription.trim(),
      charge_type: ooChargeType,
      amount_cents: Math.round(Number.parseFloat(ooAmount) * 100),
      payable_to: ooPayableTo,
    }
    setOnceOffCharges((prev) => [...prev, charge])
    setOoDescription("")
    setOoChargeType("contract_fee")
    setOoAmount("")
    setOoPayableTo("agent")
    setShowAddOnceOff(false)
  }

  function removeOnceOffCharge(id: string) {
    setOnceOffCharges((prev) => prev.filter((c) => c.id !== id))
  }

  const totalCharges = charges.reduce((s, c) => s + c.amount_cents, 0)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl mb-1">Charges</h2>
        <p className="text-sm text-muted-foreground">Recurring and once-off charges in addition to rent.</p>
      </div>

      {/* Recurring charges */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Recurring charges</h3>
            {totalCharges > 0 && (
              <p className="text-xs text-muted-foreground">{formatZAR(totalCharges)}/month in additional charges</p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAddCharge(true)}>
            <Plus className="size-4 mr-1" /> Add charge
          </Button>
        </div>

        {charges.length > 0 ? (
          <div className="space-y-2">
            {charges.map((c) => (
              <div key={c.id} className="flex items-start justify-between rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.description}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {PAYABLE_TO.find((p) => p.value === c.payable_to)?.label?.split(" ")[0]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatZAR(c.amount_cents)}/mo · from {c.start_date}
                    {c.end_date ? ` to ${c.end_date}` : ""}
                  </p>
                  {c.deduct_from_owner_payment && (
                    <p className="text-xs text-amber-500">Deducted from owner payment</p>
                  )}
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-danger ml-2"
                  onClick={() => removeCharge(c.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recurring charges added.</p>
        )}

        {showAddCharge && (
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New recurring charge</span>
              <button type="button" onClick={() => setShowAddCharge(false)}><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Charge type</Label>
                <Select value={newChargeType} onValueChange={(v) => handleTypeChange(v ?? "other")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount/month (ZAR) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End date (optional)</Label>
                <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payable to</Label>
              <Select value={newPayableTo} onValueChange={(v) => setNewPayableTo(v ?? "landlord")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYABLE_TO.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={newDeductFromOwner}
                onChange={(e) => setNewDeductFromOwner(e.target.checked)}
                className="accent-brand"
              />
              Deduct from owner payment
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddCharge(false)}>Cancel</Button>
              <Button size="sm" onClick={addCharge} disabled={!newDescription.trim() || !newAmount}>Add</Button>
            </div>
          </div>
        )}
      </section>

      {/* Once-off charges */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Once-off charges</h3>
            <p className="text-xs text-muted-foreground">Contract fees, inspection fees, key deposits, etc.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAddOnceOff(true)}>
            <Plus className="size-4 mr-1" /> Add charge
          </Button>
        </div>

        {onceOffCharges.length > 0 ? (
          <div className="space-y-2">
            {onceOffCharges.map((c) => (
              <div key={c.id} className="flex items-start justify-between rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.description}</span>
                    <Badge variant="secondary" className="text-[10px]">Once-off</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {PAYABLE_TO.find((p) => p.value === c.payable_to)?.label?.split(" ")[0]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatZAR(c.amount_cents)}</p>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-danger ml-2"
                  onClick={() => removeOnceOffCharge(c.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No once-off charges added.</p>
        )}

        {showAddOnceOff && (
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New once-off charge</span>
              <button type="button" onClick={() => setShowAddOnceOff(false)}><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Charge type</Label>
                <Select value={ooChargeType} onValueChange={(v) => handleOoTypeChange(v ?? "contract_fee")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ONCE_OFF_CHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (ZAR) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ooAmount}
                  onChange={(e) => setOoAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input value={ooDescription} onChange={(e) => setOoDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payable to</Label>
              <Select value={ooPayableTo} onValueChange={(v) => setOoPayableTo(v ?? "agent")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYABLE_TO.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddOnceOff(false)}>Cancel</Button>
              <Button size="sm" onClick={addOnceOffCharge} disabled={!ooDescription.trim() || !ooAmount}>Add</Button>
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={() => onNext({ charges, onceOffCharges })}>Continue →</Button>
      </div>
    </div>
  )
}
