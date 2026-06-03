"use client"

/**
 * components/leases/steps/details/TermsSection.tsx — the "Lease terms" section of the merged Lease-details step
 *
 * Auth:   client-only; pure form section (no DB access)
 * Data:   controlled by parent via value/onChange; CPA status derived from determineCpaApplicability
 * Notes:  Lifted from the old LeaseTermsStep, stripped of its own step-nav and wired to a controlled TermsState.
 */
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Info } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import type { CpaDetermination } from "@/lib/leases/cpaApplicability"

export interface TermsState {
  startDate: string
  endDate: string
  isFixedTerm: boolean
  noticePeriod: string
  rent: string
  deposit: string
  paymentDueDay: string
  escalationPercent: string
  escalationType: string
  depositInterestTo: string
  depositInterestRate: string
  arrearsInterestEnabled: boolean
  arrearsMargin: string
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

const CURRENT_PRIME = 11.25

interface Props {
  value: TermsState
  onChange: (next: TermsState) => void
  isResidential: boolean
  tenantIsJuristic: boolean
  cpaDetermination: CpaDetermination
}

function cpaStatusLabel(cpa: CpaDetermination): string {
  if (cpa.applies === "yes") return "CPA s14 applies"
  if (cpa.applies === "indeterminate") return "CPA status unknown"
  return "CPA s14 n/a"
}

export function TermsSection({ value, onChange, isResidential, cpaDetermination }: Readonly<Props>) {
  function set<K extends keyof TermsState>(key: K, v: TermsState[K]) {
    onChange({ ...value, [key]: v })
  }

  const depositTouched = !!value.deposit

  function handleStartDateChange(next: string) {
    const patch: Partial<TermsState> = { startDate: next }
    if (next && !value.endDate) {
      const d = new Date(next)
      d.setFullYear(d.getFullYear() + 1)
      d.setDate(d.getDate() - 1)
      patch.endDate = d.toISOString().slice(0, 10)
    }
    onChange({ ...value, ...patch })
  }

  function handleRentChange(next: string) {
    const patch: Partial<TermsState> = { rent: next }
    if (!depositTouched) {
      const rentNum = Number.parseFloat(next)
      if (rentNum > 0) patch.deposit = rentNum.toFixed(2)
    }
    onChange({ ...value, ...patch })
  }

  const effectiveArrearsRate = CURRENT_PRIME + Number(value.arrearsMargin || 0)

  return (
    <div className="space-y-6">
      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date *</Label>
          <DatePickerInput value={value.startDate} onChange={handleStartDateChange} placeholder="Start date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date {!value.isFixedTerm && <span className="text-muted-foreground text-xs">(month-to-month)</span>}</Label>
          <DatePickerInput value={value.endDate} onChange={(v) => set("endDate", v)} placeholder="End date" disabled={!value.isFixedTerm} />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="radio" checked={value.isFixedTerm} onChange={() => set("isFixedTerm", true)} className="accent-brand" />
          Fixed term
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            checked={!value.isFixedTerm}
            onChange={() => onChange({ ...value, isFixedTerm: false, endDate: "" })}
            className="accent-brand"
          />
          Month-to-month
        </label>
        {isResidential && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            {cpaStatusLabel(cpaDetermination)}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 cursor-help flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="flex-col items-start max-w-72 gap-2 py-3 px-3.5 leading-relaxed">
                  <p className="font-semibold">CPA s14 — Fixed-term lease cancellation</p>
                  {cpaDetermination.applies === "yes" && (
                    <>
                      <p>CPA s14 applies. The tenant may cancel at any time on 20 business days&apos; written notice.</p>
                      <p><span className="font-medium">Cancellation penalty:</span> 20% × monthly rent × months remaining — payable within 7 days. Falls away for any month the unit is re-let.</p>
                    </>
                  )}
                  {cpaDetermination.applies === "no" && <p>CPA s14 does not apply — the lease terms govern cancellation.</p>}
                  {cpaDetermination.applies === "indeterminate" && (
                    <p>CPA status cannot be determined until the tenant&apos;s turnover and asset value are confirmed.</p>
                  )}
                  <p className="text-xs text-muted-foreground/70 italic">{cpaDetermination.notes}</p>
                  <p className="opacity-60 border-t border-current/20 pt-1.5 w-full">
                    See lease clause:{" "}
                    <a href="/settings/lease-templates#early_termination" target="_blank" rel="noopener noreferrer" className="font-medium opacity-100 underline underline-offset-2">
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
          <Input id="rent" type="number" min="0" step="0.01" value={value.rent} onChange={(e) => handleRentChange(e.target.value)} placeholder="e.g. 8500" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deposit">Deposit (ZAR)</Label>
          <Input id="deposit" type="number" min="0" step="0.01" value={value.deposit} onChange={(e) => set("deposit", e.target.value)} placeholder="Defaults to 2× rent" />
        </div>
      </div>

      {/* Payment day */}
      <div className="space-y-2">
        <Label>Payment due day</Label>
        <Select value={value.paymentDueDay} onValueChange={(v) => set("paymentDueDay", v ?? "1")}>
          <SelectTrigger className="w-64">
            <SelectValue>{DUE_DAY_OPTIONS.find((opt) => opt.value === value.paymentDueDay)?.label ?? value.paymentDueDay}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DUE_DAY_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Escalation */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="escalation">Escalation %</Label>
          <Input id="escalation" type="number" min="0" max="25" step="0.5" value={value.escalationPercent} onChange={(e) => set("escalationPercent", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Escalation type</Label>
          <Select value={value.escalationType} onValueChange={(v) => set("escalationType", v ?? "fixed")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESCALATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Commercial: deposit interest owner */}
      {!isResidential && (
        <div className="space-y-2">
          <Label>Deposit interest accrues to</Label>
          <Select value={value.depositInterestTo} onValueChange={(v) => set("depositInterestTo", v ?? "landlord")}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="landlord">Landlord</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Interest settings */}
      <div className="space-y-4 pl-4 border-l-2 border-border">
        <div className="space-y-2">
          <Label htmlFor="deposit-rate">Deposit interest rate (% p.a.)</Label>
          <Input id="deposit-rate" type="number" min="0" max="20" step="0.25" value={value.depositInterestRate} onChange={(e) => set("depositInterestRate", e.target.value)} className="w-32" />
          <p className="text-xs text-muted-foreground">Rate paid to tenant on deposit held.</p>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
            <input type="checkbox" checked={value.arrearsInterestEnabled} onChange={(e) => set("arrearsInterestEnabled", e.target.checked)} className="accent-brand" />
            Arrears interest clause
          </label>
          {value.arrearsInterestEnabled && (
            <div className="pl-6 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">Prime +</span>
                <Input type="number" min="0" max="10" step="0.5" value={value.arrearsMargin} onChange={(e) => set("arrearsMargin", e.target.value)} className="w-20" />
                <span className="text-sm">%</span>
              </div>
              <p className="text-xs text-muted-foreground">= {effectiveArrearsRate.toFixed(2)}% p.a. at current prime ({CURRENT_PRIME}%)</p>
            </div>
          )}
        </div>
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
    </div>
  )
}
