"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { createLease } from "@/lib/actions/leases"
import { toast } from "sonner"
import { Plus, X } from "lucide-react"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { OwnerProUpgradeCard } from "@/components/billing/OwnerProUpgradeCard"

type Step = 1 | 2 | 3 | 4 | 45 | 5 | 6

interface SpecialTerm {
  type: string
  detail: string
}

interface NewLeaseFormProps {
  /** Owner tier only — how many premium slots are already in use */
  premiumSlotsUsed?: number
  isRenewal?: boolean
}

export function NewLeaseForm({ premiumSlotsUsed = 0, isRenewal = false }: NewLeaseFormProps) {
  const searchParams = useSearchParams()
  const renewalOf = searchParams.get("renewal_of")

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [renewalLoaded, setRenewalLoaded] = useState(false)

  // Step 1
  const [unitId, setUnitId] = useState("")
  const [propertyId, setPropertyId] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [leaseType, setLeaseType] = useState("residential")
  const [cpaApplies, setCpaApplies] = useState(true)
  const tenantIsJuristic = false

  // Step 2
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isFixedTerm, setIsFixedTerm] = useState(true)
  const [noticePeriod, setNoticePeriod] = useState("20")

  // Step 3
  const [premiumEnabled, setPremiumEnabled] = useState(false)
  const [rent, setRent] = useState("")
  const [paymentDueDay, setPaymentDueDay] = useState("1")
  const [escalationPercent, setEscalationPercent] = useState("10")
  const [escalationType] = useState("fixed")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositInterestTo, setDepositInterestTo] = useState("tenant")

  // Pre-populate from renewal source lease
  useEffect(() => {
    if (!renewalOf || renewalLoaded) return
    async function loadRenewal() {
      const res = await fetch(`/api/leases/${renewalOf}/renewal-data`)
      if (!res.ok) return
      const data = await res.json()
      if (data.unit_id) setUnitId(data.unit_id)
      if (data.property_id) setPropertyId(data.property_id)
      if (data.tenant_id) setTenantId(data.tenant_id)
      if (data.lease_type) setLeaseType(data.lease_type)
      if (data.rent_amount) setRent(String(data.rent_amount))
      if (data.deposit_amount) setDepositAmount(String(data.deposit_amount))
      if (data.escalation_percent) setEscalationPercent(String(data.escalation_percent))
      if (data.payment_due_day) setPaymentDueDay(String(data.payment_due_day))
      setRenewalLoaded(true)
    }
    loadRenewal()
  }, [renewalOf, renewalLoaded])

  // Step 4b: Lease clauses
  const [clauseSelections, setClauseSelections] = useState<Record<string, boolean>>({})

  // Step 4: Interest settings
  const [depositInterestRate, setDepositInterestRate] = useState("5")
  const [arrearsInterestEnabled, setArrearsInterestEnabled] = useState(true)
  const [arrearsMargin, setArrearsMargin] = useState("2")

  // Step 5
  const [specialTerms, setSpecialTerms] = useState<SpecialTerm[]>([])

  // Body corporate levy suggestion (fetched when propertyId is known)
  const [bcLevyCents, setBcLevyCents] = useState<number | null>(null)
  const [includeBCLevy, setIncludeBCLevy] = useState(false)

  useEffect(() => {
    if (!propertyId) return
    let cancelled = false
    async function fetchBC() {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data } = await supabase
        .from("properties")
        .select("is_sectional_title, levy_amount_cents")
        .eq("id", propertyId)
        .single()
      if (!cancelled && data?.is_sectional_title && data.levy_amount_cents) {
        setBcLevyCents(data.levy_amount_cents)
        setIncludeBCLevy(true) // pre-checked, agent can uncheck
      }
    }
    fetchBC()
    return () => { cancelled = true }
  }, [propertyId])

  function addSpecialTerm() {
    setSpecialTerms([...specialTerms, { type: "custom", detail: "" }])
  }

  function removeSpecialTerm(index: number) {
    setSpecialTerms(specialTerms.filter((_, i) => i !== index))
  }

  function updateSpecialTerm(index: number, field: keyof SpecialTerm, value: string) {
    const updated = [...specialTerms]
    updated[index] = { ...updated[index], [field]: value }
    setSpecialTerms(updated)
  }

  async function handleSubmit() {
    setLoading(true)
    const formData = new FormData()
    formData.set("unit_id", unitId)
    formData.set("property_id", propertyId)
    formData.set("tenant_id", tenantId)
    formData.set("lease_type", leaseType)
    formData.set("tenant_is_juristic", String(tenantIsJuristic))
    formData.set("cpa_applies", String(cpaApplies))
    formData.set("start_date", startDate)
    if (endDate) formData.set("end_date", endDate)
    formData.set("is_fixed_term", String(isFixedTerm))
    formData.set("notice_period_days", noticePeriod)
    formData.set("rent_amount", rent)
    formData.set("payment_due_day", paymentDueDay)
    formData.set("escalation_percent", escalationPercent)
    formData.set("escalation_type", escalationType)
    if (depositAmount) formData.set("deposit_amount", depositAmount)
    formData.set("deposit_interest_to", depositInterestTo)
    if (includeBCLevy && bcLevyCents) {
      formData.set("bc_levy_cents", String(bcLevyCents))
    }
    formData.set("deposit_interest_rate", depositInterestRate)
    formData.set("arrears_interest_enabled", String(arrearsInterestEnabled))
    formData.set("arrears_interest_margin", arrearsMargin)
    formData.set("special_terms", JSON.stringify(specialTerms.filter((t) => t.detail.trim())))
    formData.set("clause_selections", JSON.stringify(clauseSelections))
    formData.set("premium_enabled", String(premiumEnabled))

    const result = await createLease(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  // Step 1: Parties
  if (step === 1) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 1: Lease type and parties</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Unit ID *</Label>
            <Input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Paste unit UUID" required />
          </div>
          <div className="space-y-2">
            <Label>Property ID *</Label>
            <Input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="Paste property UUID" required />
          </div>
          <div className="space-y-2">
            <Label>Tenant ID *</Label>
            <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Paste tenant UUID" required />
          </div>
          <div className="space-y-2">
            <Label>Lease Type *</Label>
            <Select value={leaseType} onValueChange={(v) => {
              const type = v ?? "residential"
              setLeaseType(type)
              // CPA applies by default for residential, not for commercial (juristic tenants)
              setCpaApplies(type === "residential")
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">Residential</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {leaseType === "residential" && (
            <Card className="border-info/30 bg-info-bg">
              <CardContent className="text-sm pt-4">
                RHA applies. CPA s14 requires 20 business days notice. Deposit interest belongs to tenant.
              </CardContent>
            </Card>
          )}
          {leaseType === "commercial" && (
            <Card className="border-border">
              <CardContent className="text-sm pt-4 space-y-2">
                <p className="text-muted-foreground">
                  CPA does not apply to commercial leases where the tenant is a juristic person (company, CC, trust) with annual turnover above the threshold (s5(2)(b), s6(1)).
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cpaApplies}
                    onChange={(e) => setCpaApplies(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">CPA applies (tenant is a natural person or small business under R2m turnover)</span>
                </label>
              </CardContent>
            </Card>
          )}
          <Button className="w-full" onClick={() => setStep(2)}>Continue</Button>
        </div>
      </div>
    )
  }

  // Step 2: Dates
  if (step === 2) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 2: Lease dates</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Start Date *</Label>
            <DatePickerInput value={startDate} onChange={setStartDate} placeholder="Start date" />
          </div>
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={isFixedTerm} onChange={() => setIsFixedTerm(true)} />
              <span className="text-sm">Fixed term</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!isFixedTerm} onChange={() => setIsFixedTerm(false)} />
              <span className="text-sm">Month to month</span>
            </label>
          </div>
          {isFixedTerm && (
            <div className="space-y-2">
              <Label>End Date *</Label>
              <DatePickerInput value={endDate} onChange={setEndDate} placeholder="End date" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Notice Period (days)</Label>
            <Input
              type="number"
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              disabled={leaseType === "residential" && cpaApplies}
            />
            {leaseType === "residential" && cpaApplies && (
              <p className="text-xs text-muted-foreground">CPA s14 requires 20 business days — locked for residential.</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 3: Rental schedule
  if (step === 3) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 3: Rental schedule</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Monthly Rent (ZAR) *</Label>
            <Input type="number" min="0" step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="e.g. 8500" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Due Day</Label>
              <Select value={paymentDueDay} onValueChange={(v) => setPaymentDueDay(v ?? "1")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 15, 25, 28].map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}{d === 1 ? "st" : "th"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escalation %</Label>
              <Input type="number" min="0" max="25" step="0.5" value={escalationPercent} onChange={(e) => setEscalationPercent(e.target.value)} />
            </div>
          </div>
          {bcLevyCents != null && bcLevyCents > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <input
                type="checkbox"
                id="include-bc-levy"
                className="mt-0.5 cursor-pointer"
                checked={includeBCLevy}
                onChange={(e) => setIncludeBCLevy(e.target.checked)}
              />
              <label htmlFor="include-bc-levy" className="cursor-pointer leading-snug">
                <span className="font-medium">Include body corporate levy</span>
                <span className="text-muted-foreground ml-1">
                  — R{(bcLevyCents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}/mo
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This property is in a sectional title scheme. The levy will be added as an additional charge, deducted from the owner payout.
                </p>
              </label>
            </div>
          )}
          <div className="space-y-2">
            <Label>Deposit Amount (ZAR)</Label>
            <Input type="number" min="0" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Typically 1 month's rent" />
          </div>
          {leaseType === "commercial" && (
            <div className="space-y-2">
              <Label>Deposit Interest Accrues To</Label>
              <Select value={depositInterestTo} onValueChange={(v) => setDepositInterestTo(v ?? "landlord")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant</SelectItem>
                  <SelectItem value="landlord">Landlord</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {leaseType === "residential" && (
            <p className="text-xs text-muted-foreground">Deposit interest belongs to tenant (RHA statutory requirement).</p>
          )}
          {/* Owner Pro upgrade prompt — only for Owner tier */}
          {premiumSlotsUsed < 3 && (
            <OwnerProUpgradeCard
              usedSlots={premiumSlotsUsed}
              context={isRenewal ? "renewal" : "new_lease"}
              enabled={premiumEnabled}
              onEnable={() => setPremiumEnabled(true)}
              onSkip={() => setPremiumEnabled(false)}
            />
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(4)}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 4: Interest settings
  if (step === 4) {
    const currentPrime = 11.25
    const effectiveRate = currentPrime + Number(arrearsMargin || 0)
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 4: Interest settings</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Deposit interest rate (% p.a.)</Label>
            <Input
              type="number"
              min="0"
              max="20"
              step="0.25"
              value={depositInterestRate}
              onChange={(e) => setDepositInterestRate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Rate paid to tenant on deposit held. Your account may earn more — enter the rate you are passing on to the tenant.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={arrearsInterestEnabled}
                  onChange={(e) => setArrearsInterestEnabled(e.target.checked)}
                />
                <span className="text-sm font-medium">Arrears interest clause</span>
              </label>
            </div>
            {arrearsInterestEnabled && (
              <div className="space-y-2 pl-6">
                <Label>Prime + margin (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={arrearsMargin}
                  onChange={(e) => setArrearsMargin(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  = {effectiveRate.toFixed(2)}% p.a. at current prime ({currentPrime}%)
                </p>
                <p className="text-xs text-muted-foreground">
                  This must match your signed lease agreement.
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(45)}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 4b: Lease clauses
  if (step === 45) {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 5: Configure clauses</p>
        <div className="space-y-6">
          <ClauseConfigurator
            leaseType={leaseType}
            unitId={unitId}
            onSelectionsChange={setClauseSelections}
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(5)}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 5: Special terms (Addendum D)
  if (step === 5) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
        <p className="text-muted-foreground text-sm mb-4">Step 6: Special agreements (Addendum D)</p>
        <div className="space-y-4">
          {specialTerms.map((term, i) => (
            <div key={`term-${term.type}-${i}`} className="flex gap-2">
              <Select value={term.type} onValueChange={(v) => updateSpecialTerm(i, "type", v ?? "custom")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pet_permission">Pet Permission</SelectItem>
                  <SelectItem value="parking">Parking Bay</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="repair_agreement">Landlord Repair</SelectItem>
                  <SelectItem value="early_termination">Early Termination</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                value={term.detail}
                onChange={(e) => updateSpecialTerm(i, "detail", e.target.value)}
                placeholder="Details"
              />
              <Button variant="ghost" size="icon" onClick={() => removeSpecialTerm(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <button type="button" onClick={addSpecialTerm} className="text-sm text-brand hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add special term
          </button>
          {specialTerms.length === 0 && (
            <p className="text-sm text-muted-foreground">No special agreements — Addendum D will state &quot;No special agreements apply.&quot;</p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(45)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(6)}>Review</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 6: Review + submit
  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl mb-6">Create Lease</h1>
      <p className="text-muted-foreground text-sm mb-4">Step 6: Review and save</p>
      <Card className="mb-6">
        <CardContent className="pt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{leaseType}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{startDate}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{isFixedTerm ? endDate : "Month to month"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Rent</span><span>R {rent}/mo</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span>{depositAmount ? `R ${depositAmount}` : "None"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Escalation</span><span>{escalationPercent}% ({escalationType})</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Notice Period</span><span>{noticePeriod} days</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Special Terms</span><span>{specialTerms.length || "None"}</span></div>
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep(5)}>Back</Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
          {loading ? "Creating..." : "Save as Draft"}
        </Button>
      </div>
    </div>
  )
}
