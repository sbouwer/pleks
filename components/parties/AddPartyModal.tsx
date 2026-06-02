"use client"

/**
 * components/parties/AddPartyModal.tsx — the one unified "add a party" modal (ADDENDUM_19/parties)
 *
 * Notes:  Standalone wrapper around usePartyFlow (the host-agnostic add-party brain) on the shared
 *         WizardModal. Renders all three party types (landlord/tenant/supplier) from PARTY_ROLES; the
 *         actual create is injected via `onSubmit`, so the same modal serves the suppliers/landlords/
 *         tenants pages. For the in-wizard "add a landlord" sub-flow, host usePartyFlow directly with
 *         an `onDone` instead — see the property wizard. DRY: copy/fields/validation live in lib/parties.
 */
import { WizardModal } from "@/components/ui/wizard-modal"
import { type PartyRole } from "@/lib/parties/partyConfig"
import { type AddPartyInput, type AddPartyResult } from "@/lib/parties/partyValidation"
import { usePartyFlow } from "./usePartyFlow"
import { SuccessView } from "./partySteps"

export type { AddPartyInput, AddPartyResult }

export function AddPartyModal({
  role, open, onOpenChange, onSubmit, onCreated, onPrimaryAction,
}: Readonly<{
  role: PartyRole
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddPartyInput) => Promise<AddPartyResult>
  /** called after a successful create so the parent can refresh its list */
  onCreated?: () => void
  /** the success-view primary action (e.g. landlord → generate welcome pack); closes after */
  onPrimaryAction?: (result: AddPartyResult) => void
}>) {
  // Standalone: no onDone → the flow surfaces `done` and we render the SuccessView below.
  const flow = usePartyFlow({
    role,
    onSubmit: async (input) => {
      const result = await onSubmit(input)
      if (result.ok) onCreated?.()
      return result
    },
  })

  function close() {
    onOpenChange(false)
    // defer the reset so the close animation doesn't flash an empty step-0
    setTimeout(flow.reset, 200)
  }

  const result = flow.done
  const success = result ? (
    <SuccessView
      role={role}
      entity={flow.entity}
      f={flow.f}
      displayName={result.name ?? ""}
      onClose={close}
      onAddAnother={flow.reset}
      onPrimaryAction={onPrimaryAction ? () => { onPrimaryAction(result); close() } : undefined}
    />
  ) : undefined

  return (
    <WizardModal
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      eyebrow={flow.eyebrow}
      steps={flow.steps}
      current={flow.step}
      onStepSelect={flow.goTo}
      title={flow.title}
      subtitle={flow.subtitle}
      backLabel={flow.step === 0 ? "Cancel" : "Back"}
      onBack={() => (flow.step === 0 ? close() : flow.back())}
      primaryLabel={flow.primaryLabel}
      onPrimary={flow.next}
      primaryDisabled={flow.primaryDisabled}
      success={success}
    >
      {flow.body}
    </WizardModal>
  )
}
