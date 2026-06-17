"use client"

/**
 * components/leases/steps/details/TermsSection.tsx — the "Lease terms" section of the lease modal
 *
 * Auth:   client-only; pure form section (no DB access)
 * Data:   controlled by parent via value/onChange; CPA status derived from determineCpaApplicability
 * Notes:  Door-card grammar (underline fields, matches the add-party modal). Laid out as a compact 2-col
 *         grid so the whole step fits the modal without scrolling. Keeps the start→end and rent→deposit
 *         auto-fill. CPA s14 status chip + door-styled tooltip on residential leases.
 */
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Field, UnderlineInput, UnderlineSelect } from "@/components/ui/door-form"
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

const DEPOSIT_INTEREST_OPTIONS = [
  { value: "tenant", label: "Tenant" },
  { value: "landlord", label: "Landlord" },
]

const CURRENT_PRIME = 11.25

interface Props {
  value: TermsState
  onChange: (next: TermsState) => void
  isResidential: boolean
  tenantIsJuristic: boolean
  cpaDetermination: CpaDetermination
  /** durable default carried from the unit (BUILD_69); drives the auto end-date instead of a hardcoded year. */
  defaultLeasePeriodMonths?: number | null
}

function cpaStatusLabel(cpa: CpaDetermination): string {
  if (cpa.applies === "yes") return "CPA s14 applies"
  if (cpa.applies === "indeterminate") return "CPA status unknown"
  return "CPA s14 n/a"
}

function CpaChip({ cpa }: Readonly<{ cpa: CpaDetermination }>) {
  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
      {cpaStatusLabel(cpa)}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Info className="size-3.5 cursor-help flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-72 flex-col items-start gap-2 rounded-[var(--r-button)] border border-border bg-card px-3.5 py-3 leading-relaxed text-foreground shadow-lg"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              CPA s14 — Fixed-term cancellation
            </span>
            {cpa.applies === "yes" && (
              <>
                <p>CPA s14 applies. The tenant may cancel at any time on 20 business days&apos; written notice.</p>
                <p><span className="font-medium">Penalty:</span> 20% × monthly rent × months remaining — payable within 7 days. Falls away for any month the unit is re-let.</p>
              </>
            )}
            {cpa.applies === "no" && <p>CPA s14 does not apply — the lease terms govern cancellation.</p>}
            {cpa.applies === "indeterminate" && (
              <p>CPA status can&apos;t be determined until the tenant&apos;s turnover and asset value are confirmed.</p>
            )}
            <p className="text-xs italic text-muted-foreground/70">{cpa.notes}</p>
            <p className="w-full border-t border-border pt-1.5 text-muted-foreground">
              See lease clause:{" "}
              <a href="/settings/lease-templates#early_termination" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                Early Termination ↗
              </a>
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}

export function TermsSection({ value, onChange, isResidential, cpaDetermination, defaultLeasePeriodMonths }: Readonly<Props>) {
  function set<K extends keyof TermsState>(key: K, v: TermsState[K]) {
    onChange({ ...value, [key]: v })
  }

  const depositTouched = !!value.deposit

  function handleStartDateChange(next: string) {
    const patch: Partial<TermsState> = { startDate: next }
    if (next && !value.endDate) {
      // Durable default from the unit (BUILD_69) drives the term; fall back to a 12-month year.
      const months = defaultLeasePeriodMonths && defaultLeasePeriodMonths > 0 ? defaultLeasePeriodMonths : 12
      const d = new Date(next)
      d.setMonth(d.getMonth() + months)
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
    <div className="space-y-4">
      {/* Dates + term type */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Start date" required htmlFor="start-date">
          <DatePickerInput value={value.startDate} onChange={handleStartDateChange} placeholder="Start date" />
        </Field>
        <Field label={value.isFixedTerm ? "End date" : "End date · month-to-month"} htmlFor="end-date">
          <DatePickerInput value={value.endDate} onChange={(v) => set("endDate", v)} placeholder="End date" disabled={!value.isFixedTerm} />
        </Field>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" checked={value.isFixedTerm} onChange={() => set("isFixedTerm", true)} className="accent-primary" />
          Fixed term
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" checked={!value.isFixedTerm} onChange={() => onChange({ ...value, isFixedTerm: false, endDate: "" })} className="accent-primary" />
          Month-to-month
        </label>
        {isResidential && <CpaChip cpa={cpaDetermination} />}
      </div>

      {/* Money + cadence */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Monthly rent (ZAR)" required htmlFor="rent">
          <UnderlineInput id="rent" type="number" min="0" step="0.01" value={value.rent} onChange={(e) => handleRentChange(e.target.value)} placeholder="e.g. 8500" />
        </Field>
        <Field label="Deposit (ZAR)" htmlFor="deposit">
          <UnderlineInput id="deposit" type="number" min="0" step="0.01" value={value.deposit} onChange={(e) => set("deposit", e.target.value)} placeholder="Defaults to 2× rent" />
        </Field>

        <Field label="Payment due day">
          <UnderlineSelect value={value.paymentDueDay} onChange={(v) => set("paymentDueDay", v || "1")} options={DUE_DAY_OPTIONS} />
        </Field>
        <Field label="Escalation %" htmlFor="escalation">
          <UnderlineInput id="escalation" type="number" min="0" max="25" step="0.5" value={value.escalationPercent} onChange={(e) => set("escalationPercent", e.target.value)} />
        </Field>

        <Field label="Escalation type">
          <UnderlineSelect value={value.escalationType} onChange={(v) => set("escalationType", v || "fixed")} options={ESCALATION_TYPES} />
        </Field>
        {isResidential ? (
          <Field label="Deposit interest rate (% p.a.)" htmlFor="deposit-rate">
            <UnderlineInput id="deposit-rate" type="number" min="0" max="20" step="0.25" value={value.depositInterestRate} onChange={(e) => set("depositInterestRate", e.target.value)} />
          </Field>
        ) : (
          <Field label="Deposit interest accrues to">
            <UnderlineSelect value={value.depositInterestTo} onChange={(v) => set("depositInterestTo", v || "landlord")} options={DEPOSIT_INTEREST_OPTIONS} />
          </Field>
        )}

        {!isResidential && (
          <Field label="Deposit interest rate (% p.a.)" htmlFor="deposit-rate-c">
            <UnderlineInput id="deposit-rate-c" type="number" min="0" max="20" step="0.25" value={value.depositInterestRate} onChange={(e) => set("depositInterestRate", e.target.value)} />
          </Field>
        )}
      </div>

      {/* Arrears interest — compact inline */}
      <div className="space-y-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={value.arrearsInterestEnabled} onChange={(e) => set("arrearsInterestEnabled", e.target.checked)} className="accent-primary" />
          Arrears interest clause
        </label>
        {value.arrearsInterestEnabled && (
          <div className="flex items-center gap-2 pl-6 text-sm">
            <span>Prime +</span>
            <input type="number" min="0" max="10" step="0.5" value={value.arrearsMargin} onChange={(e) => set("arrearsMargin", e.target.value)} className="w-16 border-0 border-b border-input bg-transparent px-0 py-1 text-sm focus:border-primary focus:outline-none" />
            <span>% = {effectiveArrearsRate.toFixed(2)}% p.a. at current prime ({CURRENT_PRIME}%)</span>
          </div>
        )}
      </div>

      {/* Legal info — one tight line */}
      <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-info/30 bg-info/5 px-3 py-2">
        <Info className="mt-0.5 size-3.5 flex-shrink-0 text-info" />
        <p className="text-xs text-muted-foreground">
          {isResidential
            ? "RHA applies. Deposit interest belongs to the tenant (statutory). CPA s14: 20 business days' notice before automatic renewal."
            : "CPA may not apply to commercial leases. Deposit terms are contractual — confirm the notice period in your clauses."}
        </p>
      </div>
    </div>
  )
}
