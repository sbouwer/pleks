"use client"

/**
 * components/leases/LeaseWizardContext.tsx — client state for the unified lease-creation modal
 *
 * Auth:   client-only; the save paths (createLease / createUploadedLease) enforce requireAgentWriteAccess
 * Data:   in-memory WizardData (no localStorage draft — the lease modal is short-lived and prefill-driven)
 * Notes:  Mirrors app/(dashboard)/properties/new/WizardContext but flatter: 7 fixed steps (Property · Tenant ·
 *         Lease terms · Charges · Lease clauses · Annexures · Create), footer-driven nav. Steps read `data` +
 *         `patch` from here and render content-only — the lease-details slice (terms/charges/clauses/annexures)
 *         is LIVE in `data` so the four detail steps stay in sync as you navigate between them. The
 *         LeaseWizardModal footer drives Continue/Back + per-step validation. Renewal prefill loads once on mount.
 */
import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode,
} from "react"
import { buildInitialWizardData, type WizardData, type WizardPrefill } from "./wizardData"

export interface LeaseWizardContextValue {
  data: WizardData
  patch: (partial: Partial<WizardData>) => void
  step: number
  setStep: (step: number) => void
  goNext: () => void
  goBack: () => void
  totalSteps: number
  renewalOf: string | null
}

const LeaseWizardCtx = createContext<LeaseWizardContextValue | null>(null)

const TOTAL_STEPS = 7

/** Resolve the first step to land on given what was prefilled (mirrors the old wizard's jump-ahead). */
function initialStepFromPrefill(prefill: WizardPrefill): number {
  if (prefill.propertyId && prefill.unitId && prefill.tenantId) return 2 // Lease terms
  if (prefill.propertyId && prefill.unitId) return 1                     // Tenant(s)
  return 0                                                               // Property → Building → Unit
}

export function LeaseWizardProvider({
  prefill, renewalOf, children,
}: Readonly<{ prefill: WizardPrefill; renewalOf: string | null; children: ReactNode }>) {
  const [data, setData] = useState<WizardData>(() => buildInitialWizardData(prefill))
  const [step, setStep] = useState<number>(() => initialStepFromPrefill(prefill))

  const patch = useCallback((partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  // Renewal prefill — pull the source lease's terms once on mount.
  useEffect(() => {
    if (!renewalOf) return
    let cancelled = false
    async function loadRenewal() {
      const res = await fetch(`/api/leases/${renewalOf}/renewal-data`)
      if (!res.ok) return
      const d = await res.json()
      if (cancelled) return
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
    return () => { cancelled = true }
  }, [renewalOf])

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)), [])
  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), [])

  const value = useMemo<LeaseWizardContextValue>(
    () => ({ data, patch, step, setStep, goNext, goBack, totalSteps: TOTAL_STEPS, renewalOf }),
    [data, patch, step, goNext, goBack, renewalOf],
  )

  return <LeaseWizardCtx.Provider value={value}>{children}</LeaseWizardCtx.Provider>
}

export function useLeaseWizard(): LeaseWizardContextValue {
  const ctx = useContext(LeaseWizardCtx)
  if (!ctx) throw new Error("useLeaseWizard must be used inside LeaseWizardProvider")
  return ctx
}
