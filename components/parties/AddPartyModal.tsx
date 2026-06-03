"use client"

/**
 * components/parties/AddPartyModal.tsx — the one unified "add a party" modal (ADDENDUM_19/parties)
 *
 * Notes:  Standalone wrapper around usePartyFlow (the host-agnostic add-party brain) on the shared
 *         WizardModal. Renders all three party types (landlord/tenant/supplier) from PARTY_ROLES; the
 *         actual create is injected via `onSubmit`. Save + exit: a successful create refreshes the host
 *         list (onCreated) and closes the modal — no success interstitial and no reset-to-empty (the old
 *         behaviour re-mounted + reset the form when an empty list first became populated). For the
 *         in-wizard "add a landlord" sub-flow, host usePartyFlow directly with an `onDone` instead.
 */
import { WizardModal } from "@/components/ui/wizard-modal"
import { type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import { type AddPartyInput, type AddPartyResult, type PartyFormState } from "@/lib/parties/partyValidation"
import { usePartyFlow } from "./usePartyFlow"

export type { AddPartyInput, AddPartyResult }

export function AddPartyModal({
  role, open, onOpenChange, onSubmit, onCreated, mode = "add", initialEntity, initialForm,
}: Readonly<{
  role: PartyRole
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddPartyInput) => Promise<AddPartyResult>
  /** called after a successful create/update so the parent can refresh its list */
  onCreated?: () => void
  /** "edit" pre-fills from initialEntity/initialForm and switches copy to save-changes. */
  mode?: "add" | "edit"
  initialEntity?: PartyEntity
  initialForm?: PartyFormState
}>) {
  const flow = usePartyFlow({
    role, mode, initialEntity, initialForm,
    onSubmit: async (input) => {
      const result = await onSubmit(input)
      if (result.ok) onCreated?.()
      return result
    },
    // save + exit: close, then reset after the close animation so the next open starts fresh
    onDone: () => { onOpenChange(false); setTimeout(() => flow.reset(), 200) },
  })

  function close() {
    onOpenChange(false)
    setTimeout(() => flow.reset(), 200)
  }

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
    >
      {flow.body}
    </WizardModal>
  )
}
