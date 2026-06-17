"use client"

/**
 * components/leases/steps/LeaseTermsStep.tsx — step 3 of the lease modal: lease terms
 *
 * Auth:   client-only; the save path (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   reads/writes WizardData terms directly via LeaseWizardContext (live-shared, no isolated local state)
 * Notes:  Split out of the old merged LeaseDetailsStep (ADDENDUM_LEASE_CREATION_MODAL §1) so terms are their
 *         own rail step. State is LIVE in context: TermsSection edits write straight back via patch(), so the
 *         Charges/Clauses/Annexures steps always read the committed rent/deposit/escalation. submit() validates
 *         start/end/rent and persists the cpaApplies derivation + the residential depositInterestTo default so
 *         the CreateStep payload stays byte-for-byte equivalent to the old merged step.
 */
import { useState } from "react"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { StepHandle } from "../stepHandle"
import { TermsSection, type TermsState } from "./details/TermsSection"

interface Props {
  register: (handle: StepHandle) => void
}

export function LeaseTermsStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()
  const isResidential = data.leaseType === "residential"
  const [error, setError] = useState("")

  // Seed the rent fallback (asking rent) into context once so the section + downstream steps read the same value.
  const seededRent = data.rent || (data.askingRentCents ? (data.askingRentCents / 100).toFixed(2) : "")

  const value: TermsState = {
    startDate: data.startDate,
    endDate: data.endDate,
    isFixedTerm: data.isFixedTerm,
    noticePeriod: data.noticePeriod,
    rent: seededRent,
    deposit: data.deposit,
    paymentDueDay: data.paymentDueDay,
    escalationPercent: data.escalationPercent,
    escalationType: data.escalationType,
    depositInterestTo: data.depositInterestTo,
    depositInterestRate: data.depositInterestRate,
    arrearsInterestEnabled: data.arrearsInterestEnabled,
    arrearsMargin: data.arrearsMargin,
  }

  function handleChange(next: TermsState) {
    patch({
      startDate: next.startDate,
      endDate: next.endDate,
      isFixedTerm: next.isFixedTerm,
      noticePeriod: next.noticePeriod,
      rent: next.rent,
      deposit: next.deposit,
      paymentDueDay: next.paymentDueDay,
      escalationPercent: next.escalationPercent,
      escalationType: next.escalationType,
      depositInterestTo: next.depositInterestTo,
      depositInterestRate: next.depositInterestRate,
      arrearsInterestEnabled: next.arrearsInterestEnabled,
      arrearsMargin: next.arrearsMargin,
    })
  }

  const cpaDetermination = determineCpaApplicability({
    tenant: {
      entityType: data.tenantIsJuristic ? "organisation" : "individual",
      juristicType: data.tenantJuristicType,
      turnoverUnder2m: data.tenantTurnoverUnder2m,
      assetValueUnder2m: data.tenantAssetUnder2m,
      sizeBandsCapturedAt: data.tenantSizeBandsCapturedAt,
    },
    lease: { isFranchiseAgreement: data.isFranchiseAgreement },
  })
  const cpaApplies = cpaDetermination.applies === "yes"

  function submit(): boolean {
    if (!value.startDate) { setError("Start date is required"); return false }
    if (value.isFixedTerm && !value.endDate) { setError("End date is required for a fixed-term lease"); return false }
    if (!value.rent || Number.parseFloat(value.rent) <= 0) { setError("Monthly rent is required"); return false }
    setError("")
    // Persist the derivations the old merged step applied before create: CPA status + the residential
    // deposit-interest default, plus the normalised end date for month-to-month.
    patch({
      endDate: value.isFixedTerm ? value.endDate : "",
      depositInterestTo: isResidential ? "tenant" : value.depositInterestTo,
      cpaApplies,
      rent: seededRent,
    })
    return true
  }

  register({ submit })

  return (
    <div className="space-y-6">
      <TermsSection
        value={value}
        onChange={handleChange}
        isResidential={isResidential}
        tenantIsJuristic={data.tenantIsJuristic}
        cpaDetermination={cpaDetermination}
        defaultLeasePeriodMonths={data.defaultLeasePeriodMonths}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
