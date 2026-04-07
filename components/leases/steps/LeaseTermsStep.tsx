"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Info } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

const ESCALATION_TYPES = [
  { value: "fixed", label: "Fixed %" },
  { value: "cpi_linked", label: "CPI-linked" },
  { value: "negotiable", label: "Negotiable" },
]

const DUE_DAYS = [1, 3, 7, 15, 25, 28]

export function LeaseTermsStep({ data, onBack, onNext }: Readonly<Props>) {
  const [startDate, setStartDate] = useState(data.startDate)
  const [endDate, setEndDate] = useState(data.endDate)
  const [isFixedTerm, setIsFixedTerm] = useState(data.isFixedTerm)
  const [noticePeriod] = useState(data.noticePeriod)
  const [rent, setRent] = useState(data.rent || (data.askingRentCents ? (data.askingRentCents / 100).toFixed(2) : ""))
  const [deposit, setDeposit] = useState(data.deposit)
  const [paymentDueDay, setPaymentDueDay] = useState(data.paymentDueDay)
  const [escalationPercent, setEscalationPercent] = useState(data.escalationPercent)
  const [escalationType, setEscalationType] = useState(data.escalationType)
  const [depositInterestTo, setDepositInterestTo] = useState(data.depositInterestTo)
  const [depositInterestRate, setDepositInterestRate] = useState(data.depositInterestRate)
  const [arrearsInterestEnabled, setArrearsInterestEnabled] = useState(data.arrearsInterestEnabled)
  const [arrearsMargin, setArrearsMargin] = useState(data.arrearsMargin)
  const [showInterest, setShowInterest] = useState(false)
  const [error, setError] = useState("")

  const isResidential = data.leaseType === "residential"
  const tenantIsJuristic = data.tenantIsJuristic
  const cpaApplies = isResidential && !tenantIsJuristic

  function handleStartDateChange(value: string) {
    setStartDate(value)
    // Auto-calculate end date = start + 12 months if not already set
    if (value && !endDate) {
      const d = new Date(value)
      d.setFullYear(d.getFullYear() + 1)
      d.setDate(d.getDate() - 1)
      setEndDate(d.toISOString().slice(0, 10))
    }
  }

  function handleRentChange(value: string) {
    setRent(value)
    // Auto-fill deposit as 2× rent if not already set
    if (!deposit) {
      const rentNum = Number.parseFloat(value)
      if (rentNum > 0) setDeposit((rentNum * 2).toFixed(2))
    }
  }

  const currentPrime = 11.25
  const effectiveArrearsRate = currentPrime + Number(arrearsMargin || 0)

  function handleNext() {
    if (!startDate) { setError("Start date is required"); return }
    if (isFixedTerm && !endDate) { setError("End date is required for a fixed-term lease"); return }
    if (!rent || Number.parseFloat(rent) <= 0) { setError("Monthly rent is required"); return }
    setError("")

    onNext({
      startDate,
      endDate: isFixedTerm ? endDate : "",
      isFixedTerm,
      noticePeriod,
      rent,
      deposit,
      paymentDueDay,
      escalationPercent,
      escalationType,
      depositInterestTo: isResidential ? "tenant" : depositInterestTo,
      depositInterestRate,
      arrearsInterestEnabled,
      arrearsMargin,
      cpaApplies,
      tenantIsJuristic,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Lease terms</h2>
        <p className="text-sm text-muted-foreground">Financial details and duration.</p>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date *</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date {!isFixedTerm && <span className="text-muted-foreground text-xs">(month-to-month)</span>}</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            disabled={!isFixedTerm}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            checked={isFixedTerm}
            onChange={() => setIsFixedTerm(true)}
            className="accent-brand"
          />
          Fixed term
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            checked={!isFixedTerm}
            onChange={() => { setIsFixedTerm(false); setEndDate("") }}
            className="accent-brand"
          />
          Month-to-month
        </label>
        {isResidential && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            {cpaApplies ? "CPA s14 applies" : "CPA s14 n/a (juristic)"}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="flex-col items-start max-w-72 gap-2 py-3 px-3.5 leading-relaxed">
                  <p className="font-semibold">CPA s14 — Fixed-term lease cancellation</p>
                  {cpaApplies ? (
                    <>
                      <p>This tenant is a natural person on a residential lease — CPA s14 applies automatically. They may cancel at any time on 20 business days&apos; written notice.</p>
                      <p><span className="font-medium">Cancellation penalty:</span> 20% × monthly rent × months remaining — payable within 7 days. Falls away for any month the unit is re-let.</p>
                    </>
                  ) : (
                    <p>The tenant is a juristic person (company / CC / trust). CPA s14 does not apply — the lease terms govern cancellation.</p>
                  )}
                  <p className="opacity-60 border-t border-current/20 pt-1.5 w-full">
                    See lease clause:{" "}
                    <a
                      href="/settings/lease-templates#early_termination"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium opacity-100 underline underline-offset-2"
                    >
                      Early Termination ↗
                    </a>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        )}
      </div>

      {/* Rent + deposit */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rent">Monthly rent (ZAR) *</Label>
          <Input
            id="rent"
            type="number"
            min="0"
            step="0.01"
            value={rent}
            onChange={(e) => handleRentChange(e.target.value)}
            placeholder="e.g. 8500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deposit">Deposit (ZAR)</Label>
          <Input
            id="deposit"
            type="number"
            min="0"
            step="0.01"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="Defaults to 2× rent"
          />
        </div>
      </div>

      {/* Payment day */}
      <div className="space-y-2">
        <Label>Payment due day</Label>
        <Select value={paymentDueDay} onValueChange={(v) => setPaymentDueDay(v ?? "1")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_DAYS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}{d === 1 ? "st" : d === 3 ? "rd" : "th"} of the month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Escalation */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="escalation">Escalation %</Label>
          <Input
            id="escalation"
            type="number"
            min="0"
            max="25"
            step="0.5"
            value={escalationPercent}
            onChange={(e) => setEscalationPercent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Escalation type</Label>
          <Select value={escalationType} onValueChange={(v) => setEscalationType(v ?? "fixed")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESCALATION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Commercial: deposit interest owner */}
      {!isResidential && (
        <div className="space-y-2">
          <Label>Deposit interest accrues to</Label>
          <Select value={depositInterestTo} onValueChange={(v) => setDepositInterestTo(v ?? "landlord")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="landlord">Landlord</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}


      {/* Interest settings — collapsible */}
      <div>
        <button
          type="button"
          className="text-sm text-brand hover:underline"
          onClick={() => setShowInterest((v) => !v)}
        >
          {showInterest ? "▾ Hide" : "▸ Show"} interest settings
        </button>
        {showInterest && (
          <div className="mt-4 space-y-4 pl-4 border-l-2 border-border">
            <div className="space-y-2">
              <Label htmlFor="deposit-rate">Deposit interest rate (% p.a.)</Label>
              <Input
                id="deposit-rate"
                type="number"
                min="0"
                max="20"
                step="0.25"
                value={depositInterestRate}
                onChange={(e) => setDepositInterestRate(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">Rate paid to tenant on deposit held.</p>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="checkbox"
                  checked={arrearsInterestEnabled}
                  onChange={(e) => setArrearsInterestEnabled(e.target.checked)}
                  className="accent-brand"
                />
                Arrears interest clause
              </label>
              {arrearsInterestEnabled && (
                <div className="pl-6 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Prime +</span>
                    <Input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={arrearsMargin}
                      onChange={(e) => setArrearsMargin(e.target.value)}
                      className="w-20"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    = {effectiveArrearsRate.toFixed(2)}% p.a. at current prime ({currentPrime}%)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legal info bar */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <Info className="size-4 text-info mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            {isResidential
              ? "RHA applies. Deposit interest belongs to tenant (statutory). CPA s14: 20 business days' notice required before automatic renewal."
              : "CPA may not apply to commercial leases. Deposit terms are contractual. Confirm notice period with your legal clauses."}
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleNext}>Continue →</Button>
      </div>
    </div>
  )
}
