"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { PropertyUnitStep } from "./steps/PropertyUnitStep"
import { TenantStep } from "./steps/TenantStep"
import { LeaseTermsStep } from "./steps/LeaseTermsStep"
import { ChargesStep } from "./steps/ChargesStep"
import { ClausesStep } from "./steps/ClausesStep"
import { AnnexuresStep } from "./steps/AnnexuresStep"
import { ReviewStep } from "./steps/ReviewStep"

export interface LocalCharge {
  id: string
  description: string
  charge_type: string
  amount_cents: number
  start_date: string
  end_date: string | null
  payable_to: string
  deduct_from_owner_payment: boolean
}

export interface LocalOnceOffCharge {
  id: string
  description: string
  charge_type: string
  amount_cents: number
  payable_to: string
}

export interface SpecialTerm {
  type: string
  detail: string
}

export interface CoTenant {
  id: string
  name: string
}

export interface AnnexureCRules {
  pets: string
  smoking: string
  parking: string
  noise: string
  commonAreas: string
}

export interface WizardData {
  // Step 1
  propertyId: string
  propertyName: string
  unitId: string
  unitLabel: string
  leaseType: "residential" | "commercial"
  askingRentCents: number | null
  bcLevyCents: number | null
  // Step 2
  tenantId: string
  tenantName: string
  coTenants: CoTenant[]
  // Step 3
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
  cpaApplies: boolean
  tenantIsJuristic: boolean
  // Step 1 — metadata (not editable, from property/unit fetch)
  isSectionalTitle: boolean
  parkingBays: number
  hasSchemeRules: boolean
  // Step 4
  charges: LocalCharge[]
  onceOffCharges: LocalOnceOffCharge[]
  // Step 5
  clauseSelections: Record<string, boolean>
  acknowledgedConflicts: string[]
  // Step 6
  annexureCRules: AnnexureCRules
  specialTerms: SpecialTerm[]
}

export const DEFAULT_ANNEXURE_C_RULES: AnnexureCRules = {
  pets: "No pets permitted without prior written consent of the Landlord.",
  smoking: "Smoking is strictly prohibited inside the premises.",
  parking: "One (1) parking bay allocated to the Tenant.",
  noise: "No excessive noise after 22:00 or before 07:00 on weekdays, or after 23:00 on weekends.",
  commonAreas: "Common areas must be kept clean and clear of personal belongings.",
}

const STEP_LABELS = ["Property", "Tenant", "Lease terms", "Charges", "Clauses", "Annexures", "Review"]

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

interface Props {
  initialPropertyId?: string | null
  initialPropertyName?: string | null
  initialUnitId?: string | null
  initialUnitLabel?: string | null
  initialTenantId?: string | null
  initialTenantName?: string | null
  initialCoTenants?: CoTenant[]
  renewalOf?: string | null
}

export function LeaseWizard({
  initialPropertyId,
  initialPropertyName,
  initialUnitId,
  initialUnitLabel,
  initialTenantId,
  initialTenantName,
  initialCoTenants,
  renewalOf,
}: Readonly<Props>) {
  const [currentStep, setCurrentStep] = useState<Step>(() => {
    if (initialPropertyId && initialUnitId && initialTenantId) return 3
    if (initialPropertyId && initialUnitId) return 2
    return 1
  })

  const [data, setData] = useState<WizardData>({
    propertyId: initialPropertyId ?? "",
    propertyName: initialPropertyName ?? "",
    unitId: initialUnitId ?? "",
    unitLabel: initialUnitLabel ?? "",
    leaseType: "residential",
    askingRentCents: null,
    bcLevyCents: null,
    tenantId: initialTenantId ?? "",
    tenantName: initialTenantName ?? "",
    coTenants: initialCoTenants ?? [],
    startDate: "",
    endDate: "",
    isFixedTerm: true,
    noticePeriod: "20",
    rent: "",
    deposit: "",
    paymentDueDay: "1",
    escalationPercent: "8",
    escalationType: "fixed",
    depositInterestTo: "tenant",
    depositInterestRate: "5",
    arrearsInterestEnabled: true,
    arrearsMargin: "2",
    cpaApplies: true,
    tenantIsJuristic: false,
    isSectionalTitle: false,
    parkingBays: 0,
    hasSchemeRules: false,
    charges: [],
    onceOffCharges: [],
    clauseSelections: {},
    acknowledgedConflicts: [],
    annexureCRules: { ...DEFAULT_ANNEXURE_C_RULES },
    specialTerms: [],
  })

  // Pre-populate from renewal source lease
  useEffect(() => {
    if (!renewalOf) return
    async function loadRenewal() {
      const res = await fetch(`/api/leases/${renewalOf}/renewal-data`)
      if (!res.ok) return
      const d = await res.json()
      setData((prev) => ({
        ...prev,
        propertyId: d.property_id ?? prev.propertyId,
        unitId: d.unit_id ?? prev.unitId,
        tenantId: d.tenant_id ?? prev.tenantId,
        leaseType: d.lease_type ?? prev.leaseType,
        rent: d.rent_amount ? String(d.rent_amount) : prev.rent,
        deposit: d.deposit_amount ? String(d.deposit_amount) : prev.deposit,
        escalationPercent: d.escalation_percent ? String(d.escalation_percent) : prev.escalationPercent,
        paymentDueDay: d.payment_due_day ? String(d.payment_due_day) : prev.paymentDueDay,
      }))
    }
    void loadRenewal()
  }, [renewalOf])

  function patch(updates: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...updates }))
  }

  return (
    <div>
      {/* Step indicator */}
      <nav aria-label="Wizard steps" className="flex items-center mb-8">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step
          const isActive = n === currentStep
          const isDone = n < currentStep
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={n > currentStep}
                onClick={() => n < currentStep && setCurrentStep(n)}
                className={cn(
                  "flex items-center gap-1.5 px-1.5 py-1 rounded-full text-xs transition-colors",
                  isActive && "bg-brand text-white font-medium",
                  isDone && "text-brand cursor-pointer hover:bg-brand/10",
                  !isActive && !isDone && "text-muted-foreground"
                )}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold shrink-0",
                  isActive && "bg-white/20",
                  isDone && "bg-brand/20",
                  !isActive && !isDone && "bg-muted"
                )}>
                  {n}
                </span>
                <span className="hidden md:inline">{label}</span>
              </button>
              {i < STEP_LABELS.length - 1 && (
                <div className={cn("flex-1 h-px mx-0.5 min-w-[4px]", isDone ? "bg-brand/40" : "bg-border")} />
              )}
            </div>
          )
        })}
      </nav>

      {currentStep === 1 && (
        <PropertyUnitStep data={data} onNext={(u) => { patch(u); setCurrentStep(2) }} />
      )}
      {currentStep === 2 && (
        <TenantStep data={data} onBack={() => setCurrentStep(1)} onNext={(u) => { patch(u); setCurrentStep(3) }} />
      )}
      {currentStep === 3 && (
        <LeaseTermsStep data={data} onBack={() => setCurrentStep(2)} onNext={(u) => { patch(u); setCurrentStep(4) }} />
      )}
      {currentStep === 4 && (
        <ChargesStep data={data} onBack={() => setCurrentStep(3)} onNext={(u) => { patch(u); setCurrentStep(5) }} />
      )}
      {currentStep === 5 && (
        <ClausesStep data={data} onBack={() => setCurrentStep(4)} onNext={(u) => { patch(u); setCurrentStep(6) }} />
      )}
      {currentStep === 6 && (
        <AnnexuresStep data={data} onBack={() => setCurrentStep(5)} onNext={(u) => { patch(u); setCurrentStep(7) }} />
      )}
      {currentStep === 7 && (
        <ReviewStep data={data} onBack={() => setCurrentStep(6)} onEdit={(s) => setCurrentStep(s)} />
      )}
    </div>
  )
}
