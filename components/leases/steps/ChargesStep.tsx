"use client"

/**
 * components/leases/steps/ChargesStep.tsx — step 4 of the lease modal: recurring + once-off charges
 *
 * Auth:   client-only; the save path (createLease / createUploadedLease) enforces requireAgentWriteAccess
 * Data:   reads/writes WizardData.charges / onceOffCharges directly via LeaseWizardContext (live-shared)
 * Notes:  Split out of the old merged LeaseDetailsStep (ADDENDUM_LEASE_CREATION_MODAL §1). Charges live in
 *         context so the Annexures step's Annexure-A summary reads the committed list. submit() always
 *         passes (charges are optional); navigating back never desyncs because edits write straight to data.
 */
import { useLeaseWizard } from "../LeaseWizardContext"
import type { LocalCharge, LocalOnceOffCharge } from "../wizardData"
import type { StepHandle } from "../stepHandle"
import { ChargesSection } from "./details/ChargesSection"

interface Props {
  register: (handle: StepHandle) => void
}

export function ChargesStep({ register }: Readonly<Props>) {
  const { data, patch } = useLeaseWizard()

  function handleCharges(next: LocalCharge[]) { patch({ charges: next }) }
  function handleOnceOff(next: LocalOnceOffCharge[]) { patch({ onceOffCharges: next }) }

  register({ submit: () => true })

  return (
    <ChargesSection
      charges={data.charges}
      onceOffCharges={data.onceOffCharges}
      onChangeCharges={handleCharges}
      onChangeOnceOff={handleOnceOff}
    />
  )
}
