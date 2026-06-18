"use client"

/**
 * app/(dashboard)/settings/profile/EditProfileModal.tsx — 2-step editor for My profile (agent contact)
 *
 * Route:  opened from MyProfileCards (My profile → Personal tab)
 * Auth:   client island; saves via updateAgentContactParty (PII-safe — id hash + audit + self-landlord sync)
 * Data:   seeded from the cards' loaded PartyFormState; opens jumped to the clicked card's step.
 * Notes:  Same WizardModal door-grammar as the org/supplier edit modals. Reuses the add-party section
 *         bodies (IndividualIdentity + CompanyAddressSection) — identical fields to the rest of the app.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { WizardModal } from "@/components/ui/wizard-modal"
import { IndividualIdentity, CompanyAddressSection } from "@/components/parties/partySteps"
import { updateAgentContactParty } from "@/lib/actions/parties"
import type {
  PartyFormState, PartyErrors, PartyPerson, PartyAddressInput, PartyBankAccountInput,
} from "@/lib/parties/partyValidation"

type SetValue = string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]
export type ProfileStep = "personal" | "address"

const STEPS: { id: ProfileStep; label: string }[] = [
  { id: "personal", label: "Personal details" },
  { id: "address", label: "Address" },
]

export function EditProfileModal({
  open, onOpenChange, initialStep, contactId, initialForm, onSaved,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStep: ProfileStep
  contactId: string
  initialForm: PartyFormState
  onSaved?: () => void
}>) {
  const [current, setCurrent] = useState(0)
  const [form, setForm] = useState<PartyFormState>(initialForm ?? {})
  const [errors, setErrors] = useState<PartyErrors>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(initialForm ?? {})
    setErrors({})
    setError(null)
    setCurrent(Math.max(0, STEPS.findIndex((s) => s.id === initialStep)))
  }, [open, initialStep, initialForm])

  const set = (k: keyof PartyFormState, v: SetValue) => setForm((prev) => ({ ...prev, [k]: v }) as PartyFormState)

  async function save() {
    const e: PartyErrors = {}
    if (!form.firstName?.trim()) e.firstName = "Required"
    if (!form.lastName?.trim()) e.lastName = "Required"
    if (!form.email?.trim()) e.email = "Required"
    if (!form.phone?.trim()) e.phone = "Required"
    setErrors(e)
    if (Object.keys(e).length > 0) {
      setCurrent(0)
      setError("Please complete the required personal details.")
      return
    }
    setSaving(true)
    setError(null)
    const res = await updateAgentContactParty(form, contactId)
    setSaving(false)
    if (res.ok) { toast.success("Saved"); onSaved?.(); onOpenChange(false) }
    else setError(res.error ?? "Failed to save")
  }

  const steps = STEPS.map((s) => ({ ...s, done: true }))

  return (
    <WizardModal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="MY PROFILE"
      steps={steps}
      current={current}
      onStepSelect={setCurrent}
      title={STEPS[current].label}
      backLabel="Close"
      onBack={() => onOpenChange(false)}
      primaryLabel={saving ? "Saving…" : "Save changes"}
      onPrimary={save}
      primaryDisabled={saving}
      footerError={error}
    >
      {current === 0 && <IndividualIdentity f={form} set={set} errors={errors} fullFica={false} stepNumber="" />}
      {current === 1 && (
        <CompanyAddressSection
          n=""
          title="Address"
          optional
          addresses={form.addresses ?? []}
          onChange={(a) => set("addresses", a)}
          error={errors.addresses}
        />
      )}
    </WizardModal>
  )
}
