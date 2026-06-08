"use client"

/**
 * app/(dashboard)/settings/profile/MyProfileForm.tsx — My profile Personal / Address forms (agent contact)
 *
 * Route:  /settings/profile?tab=personal|address
 * Data:   initialForm (PartyFormState) from fetchAgentContactParty; saves via updateAgentContactParty
 *         (PII-safe — id-number hash + audit + self-landlord sync) against the user's agent contact.
 * Notes:  Reuses the add-party UI verbatim — IndividualIdentity (the individual person fields) and
 *         CompanyAddressSection (typed physical/postal/billing addresses). One form per tab (URL tabs
 *         reset state on switch). See ADDENDUM_AGENT_CONTACT_IDENTITY.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { IndividualIdentity, CompanyAddressSection } from "@/components/parties/partySteps"
import { updateAgentContactParty } from "@/lib/actions/parties"
import type {
  PartyFormState, PartyErrors, PartyPerson, PartyAddressInput, PartyBankAccountInput,
} from "@/lib/parties/partyValidation"

type SetValue = string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]

export function MyProfileForm({ contactId, initialForm, tab }: Readonly<{
  contactId: string
  initialForm: PartyFormState
  tab: "personal" | "address"
}>) {
  const router = useRouter()
  const [form, setForm] = useState<PartyFormState>(initialForm)
  const [errors, setErrors] = useState<PartyErrors>({})
  const [saving, setSaving] = useState(false)

  const set = (k: keyof PartyFormState, v: SetValue) =>
    setForm((prev) => ({ ...prev, [k]: v }) as PartyFormState)

  async function save() {
    if (tab === "personal") {
      const e: PartyErrors = {}
      if (!form.firstName?.trim()) e.firstName = "Required"
      if (!form.lastName?.trim()) e.lastName = "Required"
      if (!form.email?.trim()) e.email = "Required"
      if (!form.phone?.trim()) e.phone = "Required"
      setErrors(e)
      if (Object.keys(e).length > 0) { toast.error("Please complete the required fields"); return }
    }
    setSaving(true)
    const res = await updateAgentContactParty(form, contactId)
    setSaving(false)
    if (res.ok) { toast.success("Saved"); router.refresh() }
    else toast.error(res.error ?? "Failed to save")
  }

  return (
    <div className="max-w-2xl">
      {tab === "personal" && <IndividualIdentity f={form} set={set} errors={errors} fullFica={false} stepNumber="" />}
      {tab === "address" && (
        <CompanyAddressSection
          n=""
          title="Address"
          optional
          addresses={form.addresses ?? []}
          onChange={(a) => set("addresses", a)}
          error={errors.addresses}
        />
      )}
      <div className="mt-6 flex justify-end border-t border-border/40 pt-4">
        <ActionButton tone="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </ActionButton>
      </div>
    </div>
  )
}
