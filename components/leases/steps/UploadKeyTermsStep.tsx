"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

const DUE_DAY_OPTIONS = [
  { value: "1", label: "1st of the month" },
  { value: "3", label: "3rd of the month" },
  { value: "7", label: "7th of the month" },
  { value: "15", label: "15th of the month" },
  { value: "25", label: "25th of the month" },
  { value: "28", label: "28th of the month" },
  { value: "last_day", label: "Last day of the month" },
  { value: "last_working_day", label: "Last working day of the month" },
]

const NOTICE_PERIOD_OPTIONS = [
  { value: "20", label: "1 calendar month (20 business days)" },
  { value: "30", label: "30 calendar days" },
  { value: "60", label: "60 calendar days" },
]

export function UploadKeyTermsStep({ data, onBack, onNext }: Readonly<Props>) {
  const [startDate, setStartDate] = useState(data.startDate)
  const [endDate, setEndDate] = useState(data.endDate)
  const [isFixedTerm, setIsFixedTerm] = useState(data.isFixedTerm)
  const [rent, setRent] = useState(
    data.rent || (data.askingRentCents ? (data.askingRentCents / 100).toFixed(2) : "")
  )
  const [deposit, setDeposit] = useState(data.deposit)
  const [depositTouched, setDepositTouched] = useState(!!data.deposit)
  const [paymentDueDay, setPaymentDueDay] = useState(data.paymentDueDay)
  const [escalationPercent, setEscalationPercent] = useState(data.escalationPercent)
  const [escalationType, setEscalationType] = useState(data.escalationType)
  const [noticePeriod, setNoticePeriod] = useState(data.noticePeriod)
  const [error, setError] = useState("")

  function handleStartDateChange(value: string) {
    setStartDate(value)
    if (value && !endDate) {
      const d = new Date(value)
      d.setFullYear(d.getFullYear() + 1)
      d.setDate(d.getDate() - 1)
      setEndDate(d.toISOString().slice(0, 10))
    }
  }

  function handleRentChange(value: string) {
    setRent(value)
    if (!depositTouched) {
      const rentNum = Number.parseFloat(value)
      if (rentNum > 0) setDeposit(rentNum.toFixed(2))
    }
  }

  function handleNext() {
    if (!startDate) { setError("Start date is required"); return }
    if (isFixedTerm && !endDate) { setError("End date is required for a fixed-term lease"); return }
    if (!rent || Number.parseFloat(rent) <= 0) { setError("Monthly rent is required"); return }
    setError("")

    const cpaApplies = data.leaseType === "residential" && !data.tenantIsJuristic

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
      cpaApplies,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Key lease terms</h2>
        <p className="text-sm text-muted-foreground">
          The financial terms Pleks needs for invoicing and tracking.
        </p>
      </div>

      {/* Term type */}
      <div className="space-y-2">
        <Label>Lease type</Label>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="termType"
              checked={isFixedTerm}
              onChange={() => setIsFixedTerm(true)}
              className="accent-brand"
            />
            <span className="text-sm">Fixed term</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="termType"
              checked={!isFixedTerm}
              onChange={() => { setIsFixedTerm(false); setEndDate("") }}
              className="accent-brand"
            />
            <span className="text-sm">Month-to-month</span>
          </label>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start date *</Label>
          <DatePickerInput value={startDate} onChange={handleStartDateChange} placeholder="Start date" />
        </div>
        {isFixedTerm && (
          <div className="space-y-1.5">
            <Label htmlFor="endDate">End date *</Label>
            <DatePickerInput value={endDate} onChange={setEndDate} placeholder="End date" />
          </div>
        )}
      </div>

      {/* Rent + deposit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rent">Monthly rent *</Label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">R</span>
            <Input
              id="rent"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={rent}
              onChange={(e) => handleRentChange(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deposit">Deposit</Label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">R</span>
            <Input
              id="deposit"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={deposit}
              onChange={(e) => { setDeposit(e.target.value); setDepositTouched(true) }}
            />
          </div>
        </div>
      </div>

      {/* Payment due day */}
      <div className="space-y-1.5">
        <Label htmlFor="paymentDueDay">Payment due</Label>
        <Select value={paymentDueDay} onValueChange={(v) => { if (v) setPaymentDueDay(v) }}>
          <SelectTrigger id="paymentDueDay">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_DAY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Escalation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="escalationPercent">Escalation %</Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="escalationPercent"
              type="number"
              min="0"
              step="0.5"
              value={escalationPercent}
              onChange={(e) => setEscalationPercent(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="escalationType">Escalation type</Label>
          <Select value={escalationType} onValueChange={(v) => { if (v) setEscalationType(v) }}>
            <SelectTrigger id="escalationType">
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

      {/* Notice period */}
      <div className="space-y-1.5">
        <Label htmlFor="noticePeriod">Notice period</Label>
        <Select value={noticePeriod} onValueChange={(v) => { if (v) setNoticePeriod(v) }}>
          <SelectTrigger id="noticePeriod">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTICE_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <Button type="button" onClick={handleNext}>Next →</Button>
      </div>
    </div>
  )
}
