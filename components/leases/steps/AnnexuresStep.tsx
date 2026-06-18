"use client"

/**
 * components/leases/steps/AnnexuresStep.tsx — step 6 of the lease modal: the four lease annexures (A–D)
 *
 * Auth:   client-only; the save path (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   reads/writes WizardData.annexureCRules / specialTerms; reads the committed terms + charges from context
 * Notes:  Split out of the old merged LeaseDetailsStep (ADDENDUM_LEASE_CREATION_MODAL §1). The Annexure-A summary
 *         reads rent/deposit/escalation/charges straight from `data` (the Terms + Charges steps committed them
 *         there), so navigating back/forward never desyncs the summary. submit() always passes; the indeterminate-
 *         CPA guard from the old step is surfaced here (and still enforced by CreateStep before create).
 */
import { Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"
import { useLeaseWizard } from "../LeaseWizardContext"
import type { AnnexureCRules, SpecialTerm } from "../wizardData"
import type { StepHandle } from "../stepHandle"
import { AnnexuresSection } from "./details/AnnexuresSection"

interface Props {
  register: (handle: StepHandle) => void
}

export function AnnexuresStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()

  function handleRules(next: AnnexureCRules) { patch({ annexureCRules: next }) }
  function handleSpecialTerms(next: SpecialTerm[]) { patch({ specialTerms: next }) }

  // Require a trust account when the org has accounts (ADDENDUM_69A). The deposit account is OPTIONAL —
  // it falls back to the trust account, so it's not gated.
  const accountsMissing = data.availableAccounts.length > 0 && !data.trustAccountId

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

  register({ submit: () => !accountsMissing })

  return (
    <div className="space-y-6">
      <AnnexuresSection
        rent={data.rent}
        deposit={data.deposit}
        paymentDueDay={data.paymentDueDay}
        escalationPercent={data.escalationPercent}
        escalationType={data.escalationType}
        charges={data.charges}
        onceOffCharges={data.onceOffCharges}
        rules={data.annexureCRules}
        specialTerms={data.specialTerms}
        availableAccounts={data.availableAccounts}
        trustAccountId={data.trustAccountId}
        depositAccountId={data.depositAccountId}
        depositInterestBeneficiary={data.depositInterestBeneficiary}
        onSelectTrust={(id) => patch({ trustAccountId: id })}
        onSelectDeposit={(id) => patch({ depositAccountId: id })}
        onSelectBeneficiary={(v) => patch({ depositInterestBeneficiary: v })}
        onChangeRules={handleRules}
        onChangeSpecialTerms={handleSpecialTerms}
      />

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
    </div>
  )
}
