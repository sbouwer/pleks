"use client"

/**
 * components/leases/steps/LeaseDetailsStep.tsx — step 3 of the lease modal: the merged "Lease details" step
 *
 * Auth:   client-only; the save path (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   reads/writes WizardData (terms, charges, clauses, annexures) via LeaseWizardContext
 * Notes:  Collapses the old Lease terms + Charges + Clauses + Annexures steps into one sectioned step
 *         (ADDENDUM_LEASE_CREATION_MODAL §1/D-2), prefilled from the unit's rule-set. Content-only — the
 *         modal footer drives Continue, which calls submit(): validates terms, blocks on unresolved clause
 *         conflicts, then commits everything to context. Per-section editing state stays local to each
 *         section component to keep each function's cognitive complexity low.
 */
import { useState } from "react"
import { Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { LocalCharge, LocalOnceOffCharge, AnnexureCRules, SpecialTerm } from "../wizardData"
import type { StepHandle } from "../stepHandle"
import { TermsSection, type TermsState } from "./details/TermsSection"
import { ChargesSection } from "./details/ChargesSection"
import { ClausesSection } from "./details/ClausesSection"
import { AnnexuresSection } from "./details/AnnexuresSection"

interface Props {
  register: (handle: StepHandle) => void
}

function SectionShell({ title, subtitle, children }: Readonly<{ title: string; subtitle: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-heading text-base">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

export function LeaseDetailsStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()

  const isResidential = data.leaseType === "residential"

  // ── Terms ──
  const [terms, setTerms] = useState<TermsState>({
    startDate: data.startDate,
    endDate: data.endDate,
    isFixedTerm: data.isFixedTerm,
    noticePeriod: data.noticePeriod,
    rent: data.rent || (data.askingRentCents ? (data.askingRentCents / 100).toFixed(2) : ""),
    deposit: data.deposit,
    paymentDueDay: data.paymentDueDay,
    escalationPercent: data.escalationPercent,
    escalationType: data.escalationType,
    depositInterestTo: data.depositInterestTo,
    depositInterestRate: data.depositInterestRate,
    arrearsInterestEnabled: data.arrearsInterestEnabled,
    arrearsMargin: data.arrearsMargin,
  })

  // ── Charges ──
  const [charges, setCharges] = useState<LocalCharge[]>(data.charges)
  const [onceOffCharges, setOnceOffCharges] = useState<LocalOnceOffCharge[]>(data.onceOffCharges)

  // ── Clauses ──
  const [clauseSelections, setClauseSelections] = useState<Record<string, boolean>>(data.clauseSelections)
  const [acknowledgedConflicts, setAcknowledgedConflicts] = useState<string[]>(data.acknowledgedConflicts)
  const [clausesBlocked, setClausesBlocked] = useState(false)

  // ── Annexures ──
  const [annexureCRules, setAnnexureCRules] = useState<AnnexureCRules>(data.annexureCRules)
  const [specialTerms, setSpecialTerms] = useState<SpecialTerm[]>(data.specialTerms)

  const [error, setError] = useState("")

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
    if (!terms.startDate) { setError("Start date is required"); return false }
    if (terms.isFixedTerm && !terms.endDate) { setError("End date is required for a fixed-term lease"); return false }
    if (!terms.rent || Number.parseFloat(terms.rent) <= 0) { setError("Monthly rent is required"); return false }
    if (clausesBlocked) { setError("Resolve or acknowledge all clause conflicts before continuing."); return false }
    setError("")

    patch({
      startDate: terms.startDate,
      endDate: terms.isFixedTerm ? terms.endDate : "",
      isFixedTerm: terms.isFixedTerm,
      noticePeriod: terms.noticePeriod,
      rent: terms.rent,
      deposit: terms.deposit,
      paymentDueDay: terms.paymentDueDay,
      escalationPercent: terms.escalationPercent,
      escalationType: terms.escalationType,
      depositInterestTo: isResidential ? "tenant" : terms.depositInterestTo,
      depositInterestRate: terms.depositInterestRate,
      arrearsInterestEnabled: terms.arrearsInterestEnabled,
      arrearsMargin: terms.arrearsMargin,
      cpaApplies,
      charges,
      onceOffCharges,
      clauseSelections,
      acknowledgedConflicts,
      annexureCRules,
      specialTerms,
    })
    return true
  }

  register({ submit })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl mb-1">Lease details</h2>
        <p className="text-sm text-muted-foreground">
          Terms, charges, clauses, and annexures — prefilled from the unit. Adjust anything that differs.
        </p>
      </div>

      <SectionShell title="Lease terms" subtitle="Financial details and duration.">
        <TermsSection
          value={terms}
          onChange={setTerms}
          isResidential={isResidential}
          tenantIsJuristic={data.tenantIsJuristic}
          cpaDetermination={cpaDetermination}
        />
      </SectionShell>

      <SectionShell title="Charges" subtitle="Recurring and once-off charges in addition to rent.">
        <ChargesSection
          charges={charges}
          onceOffCharges={onceOffCharges}
          onChangeCharges={setCharges}
          onChangeOnceOff={setOnceOffCharges}
        />
      </SectionShell>

      <SectionShell title="Lease clauses" subtitle="Configure which clauses apply to this lease.">
        <ClausesSection
          leaseType={data.leaseType}
          unitId={data.unitId}
          isSectionalTitle={data.isSectionalTitle}
          hasSchemeRules={data.hasSchemeRules}
          parkingBays={data.parkingBays}
          annexureCRules={annexureCRules}
          clauseSelections={clauseSelections}
          acknowledgedConflicts={acknowledgedConflicts}
          onChangeSelections={setClauseSelections}
          onChangeAcknowledged={setAcknowledgedConflicts}
          onBlockedChange={setClausesBlocked}
        />
      </SectionShell>

      <SectionShell title="Annexures" subtitle="Review and amend the four lease annexures.">
        <AnnexuresSection
          rent={terms.rent}
          deposit={terms.deposit}
          paymentDueDay={terms.paymentDueDay}
          escalationPercent={terms.escalationPercent}
          escalationType={terms.escalationType}
          charges={charges}
          onceOffCharges={onceOffCharges}
          rules={annexureCRules}
          specialTerms={specialTerms}
          onChangeRules={setAnnexureCRules}
          onChangeSpecialTerms={setSpecialTerms}
        />
      </SectionShell>

      {!cpaDetermination.canActivate && (
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="flex items-start gap-3 py-3 px-4">
            <Info className="size-4 text-danger mt-0.5 flex-shrink-0" />
            <p className="text-xs text-danger">
              CPA status is indeterminate. Go back to the Tenant step and confirm the tenant&apos;s annual turnover
              and asset value before creating this lease.
            </p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
