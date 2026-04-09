"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { PropertyUnitStep } from "./steps/PropertyUnitStep"
import { TenantStep } from "./steps/TenantStep"
import { UploadKeyTermsStep } from "./steps/UploadKeyTermsStep"
import { UploadDocumentStep } from "./steps/UploadDocumentStep"
import type { WizardData, CoTenant } from "./LeaseWizard"
import { DEFAULT_ANNEXURE_C_RULES } from "./LeaseWizard"

const STEP_LABELS = ["Property", "Tenant", "Key terms", "Upload & review"]

type Step = 1 | 2 | 3 | 4

interface Props {
  initialPropertyId?: string | null
  initialPropertyName?: string | null
  initialUnitId?: string | null
  initialUnitLabel?: string | null
  initialTenantId?: string | null
  initialTenantName?: string | null
  initialCoTenants?: CoTenant[]
}

export function LeaseWizardUpload({
  initialPropertyId,
  initialPropertyName,
  initialUnitId,
  initialUnitLabel,
  initialTenantId,
  initialTenantName,
  initialCoTenants,
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

  function patch(updates: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...updates }))
  }

  return (
    <div>
      {/* Step indicator */}
      <nav aria-label="Wizard steps" className="flex items-center mb-8">
        {STEP_LABELS.map((label, idx) => {
          const step = (idx + 1) as Step
          const isActive = step === currentStep
          const isDone = step < currentStep
          return (
            <div key={label} className="flex items-center">
              {idx > 0 && (
                <div className={cn("h-px w-8 mx-1", isDone ? "bg-brand" : "bg-border")} />
              )}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "size-6 rounded-full flex items-center justify-center text-xs font-medium",
                    isActive && "bg-brand text-white",
                    isDone && "bg-brand/20 text-brand",
                    !isActive && !isDone && "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? "✓" : step}
                </div>
                <span
                  className={cn(
                    "text-xs mt-1 hidden sm:block",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </nav>

      {currentStep === 1 && (
        <PropertyUnitStep
          data={data}
          onNext={(updates) => { patch(updates); setCurrentStep(2) }}
        />
      )}
      {currentStep === 2 && (
        <TenantStep
          data={data}
          onBack={() => setCurrentStep(1)}
          onNext={(updates) => { patch(updates); setCurrentStep(3) }}
        />
      )}
      {currentStep === 3 && (
        <UploadKeyTermsStep
          data={data}
          onBack={() => setCurrentStep(2)}
          onNext={(updates) => { patch(updates); setCurrentStep(4) }}
        />
      )}
      {currentStep === 4 && (
        <UploadDocumentStep
          data={data}
          onBack={() => setCurrentStep(3)}
        />
      )}
    </div>
  )
}
