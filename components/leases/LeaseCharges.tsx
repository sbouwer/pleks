"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Plus, Trash2 } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface LeaseCharge {
  id: string
  description: string
  charge_type: string
  amount_cents: number
  start_date: string
  end_date: string | null
  payable_to: string
  payable_to_contractor_id: string | null
  deduct_from_owner_payment: boolean
  contractors: { name: string } | null
}

interface LeaseChargesProps {
  leaseId: string
}

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

const PAYABLE_TO = [
  { value: "landlord", label: "Landlord (owner income)" },
  { value: "body_corporate", label: "Body corporate" },
  { value: "agent", label: "Agent (retained)" },
  { value: "third_party", label: "Third party vendor" },
]

function getDefaultsForType(chargeType: string) {
  if (chargeType === "body_corporate_levy" || chargeType === "special_levy") {
    return { payableTo: "body_corporate", deductFromOwner: true }
  }
  return { payableTo: "landlord", deductFromOwner: false }
}

export function LeaseCharges({ leaseId }: Readonly<LeaseChargesProps>) {
  const router = useRouter()
  const [charges, setCharges] = useState<LeaseCharge[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [description, setDescription] = useState("")
  const [chargeType, setChargeType] = useState("other")
  const [amount, setAmount] = useState("")
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState("")
  const [payableTo, setPayableTo] = useState("landlord")
  const [deductFromOwner, setDeductFromOwner] = useState(false)

  const loadCharges = useCallback(async () => {
    try {
      const res = await fetch(`/api/leases/${leaseId}/charges`)
      if (res.ok) {
        const data = await res.json()
        setCharges(data.charges ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [leaseId])

  useEffect(() => { void loadCharges() }, [loadCharges])

  function handleTypeChange(type: string) {
    setChargeType(type)
    const defaults = getDefaultsForType(type)
    setPayableTo(defaults.payableTo)
    setDeductFromOwner(defaults.deductFromOwner)
    // Pre-fill description
    const typeLabel = CHARGE_TYPES.find((t) => t.value === type)?.label
    if (typeLabel && !description) setDescription(typeLabel)
  }

  async function handleSave() {
    if (!description.trim() || !amount) {
      toast.error("Description and amount are required")
      return
    }
    setSaving(true)
    const res = await fetch(`/api/leases/${leaseId}/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        charge_type: chargeType,
        amount_cents: Math.round(Number.parseFloat(amount) * 100),
        start_date: startDate,
        end_date: endDate || null,
        payable_to: payableTo,
        deduct_from_owner_payment: deductFromOwner,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Charge added")
      setShowAdd(false)
      resetForm()
      loadCharges()
      router.refresh()
    } else {
      const data = await res.json()
      toast.error(data.error || "Failed to add charge")
    }
  }

  async function handleRemove(chargeId: string) {
    const res = await fetch(`/api/leases/${leaseId}/charges`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId }),
    })
    if (res.ok) {
      toast.success("Charge removed")
      loadCharges()
      router.refresh()
    }
  }

  function resetForm() {
    setDescription("")
    setChargeType("other")
    setAmount("")
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate("")
    setPayableTo("landlord")
    setDeductFromOwner(false)
  }

  const totalCharges = charges.reduce((sum, c) => sum + c.amount_cents, 0)

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Additional charges</CardTitle>
          {totalCharges > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatZAR(totalCharges)}/month in additional charges
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1" /> Add charge
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional charges on this lease.</p>
        ) : (
          <div className="space-y-3">
            {charges.map((c) => (
              <div key={c.id} className="flex items-start justify-between border-b border-border/50 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{c.description}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {PAYABLE_TO.find((p) => p.value === c.payable_to)?.label?.split(" ")[0] ?? c.payable_to}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatZAR(c.amount_cents)}/mo · from {c.start_date}
                    {c.end_date ? ` to ${c.end_date}` : ""}
                    {c.contractors ? ` · ${c.contractors.name}` : ""}
                  </p>
                  {c.deduct_from_owner_payment && (
                    <p className="text-xs text-amber-500">Deducted from owner payment</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-danger" onClick={() => handleRemove(c.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add charge dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add charge to lease</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Charge type</Label>
                <Select value={chargeType} onValueChange={(v) => handleTypeChange(v ?? "other")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHARGE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Body corporate levy" />
              </div>
              <div className="space-y-2">
                <Label>Amount per month (ZAR) *</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1559.07" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Starts *</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ends</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="Follows lease" />
                  <p className="text-xs text-muted-foreground">Leave blank to follow lease end date</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payable to</Label>
                <Select value={payableTo} onValueChange={(v) => setPayableTo(v ?? "landlord")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYABLE_TO.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductFromOwner}
                  onChange={(e) => setDeductFromOwner(e.target.checked)}
                  className="accent-brand"
                />
                <span className="text-sm">Deduct from owner payment</span>
              </label>
              {deductFromOwner && (
                <p className="text-xs text-muted-foreground -mt-2 ml-6">
                  This charge will be deducted before netting to the property owner on the owner statement.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); resetForm() }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !description.trim() || !amount}>
                {saving ? "Adding..." : "Add charge"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
