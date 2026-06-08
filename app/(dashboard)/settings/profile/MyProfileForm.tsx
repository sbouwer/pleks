"use client"

/**
 * app/(dashboard)/settings/profile/MyProfileForm.tsx — My profile Personal / Contact & address forms
 *
 * Route:  /settings/profile?tab=personal|contact
 * Data:   initialData (OrgDetails) from getOrgDetails; saves the active tab's slice via PATCH /api/org/details
 * Notes:  Built on the canonical field grammar (components/forms/fields) — the add-contact look. Personal
 *         = identity fields; Contact = contact details + one or more typed addresses. Saves only the
 *         active tab's fields (partial PATCH). One form per tab (URL tabs reset state on switch).
 */
import { useState } from "react"
import { toast } from "sonner"
import { Plus, X } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { FieldGrid, TextField, SelectField, type FieldOption } from "@/components/forms/fields"
import { TITLES, PROVINCES, ADDRESS_TYPES, type FormState, type OrgDetails } from "../details/sections"

const cap = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
const TITLE_OPTS: FieldOption[] = [{ value: "", label: "—" }, ...TITLES.map((v) => ({ value: v, label: v }))]
const GENDER_OPTS: FieldOption[] = [
  { value: "", label: "—" }, { value: "male", label: "Male" },
  { value: "female", label: "Female" }, { value: "prefer_not_to_say", label: "Prefer not to say" },
]
const PROVINCE_OPTS: FieldOption[] = [{ value: "", label: "Province…" }, ...PROVINCES.map((v) => ({ value: v, label: v }))]
const ADDR_TYPE_OPTS: FieldOption[] = ADDRESS_TYPES.map((v) => ({ value: v, label: cap(v) }))

const PERSONAL_FIELDS = ["title", "initials", "first_name", "last_name", "gender", "date_of_birth", "id_number"] as const
const CONTACT_FIELDS = [
  "mobile", "phone", "email",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
] as const

function AddressBlock({ form, set, prefix, label, onRemove }: Readonly<{
  form: FormState
  set: (f: keyof FormState, v: string) => void
  prefix: "addr" | "addr2"
  label: string
  onRemove?: () => void
}>) {
  const k = (c: string) => `${prefix}_${c}` as keyof FormState
  const v = (c: string) => (form[k(c)] as string | null) ?? ""
  return (
    <FieldGrid>
      <div className="flex items-center justify-between sm:col-span-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground transition-colors hover:text-destructive">
            <X className="size-4" />
          </button>
        )}
      </div>
      <SelectField label="Address type" value={v("type")} onChange={(x) => set(k("type"), x)} options={ADDR_TYPE_OPTS} span />
      <TextField label="Street address" required span value={v("line1")} onChange={(x) => set(k("line1"), x)} placeholder="14 Rose Street" />
      <TextField label="Suburb" value={v("suburb")} onChange={(x) => set(k("suburb"), x)} />
      <TextField label="City / Town" required value={v("city")} onChange={(x) => set(k("city"), x)} />
      <SelectField label="Province" value={v("province")} onChange={(x) => set(k("province"), x)} options={PROVINCE_OPTS} />
      <TextField label="Postal code" value={v("postal_code")} onChange={(x) => set(k("postal_code"), x)} maxLength={4} />
    </FieldGrid>
  )
}

export function MyProfileForm({ initialData, tab }: Readonly<{ initialData: OrgDetails; tab: "personal" | "contact" }>) {
  const [form, setForm] = useState<FormState>(initialData)
  const [showSecondAddr, setShowSecondAddr] = useState(!!initialData.addr2_line1)
  const [saving, setSaving] = useState(false)

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value || null }))
  }

  function removeSecondAddr() {
    setShowSecondAddr(false)
    setForm((prev) => ({
      ...prev,
      addr2_type: null, addr2_line1: null, addr2_suburb: null,
      addr2_city: null, addr2_province: null, addr2_postal_code: null,
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const fields = tab === "personal" ? PERSONAL_FIELDS : CONTACT_FIELDS
      const payload: Partial<FormState> = {}
      for (const f of fields) payload[f] = form[f]
      const res = await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) toast.success("Saved")
      else toast.error("Failed to save")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {tab === "personal" && (
        <FieldGrid>
          <SelectField label="Title" value={form.title} onChange={(v) => set("title", v)} options={TITLE_OPTS} />
          <TextField label="Initials" value={form.initials} onChange={(v) => set("initials", v)} placeholder="e.g. J.P." />
          <TextField label="First name" required value={form.first_name} onChange={(v) => set("first_name", v)} />
          <TextField label="Last name" required value={form.last_name} onChange={(v) => set("last_name", v)} />
          <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTS} />
          <TextField label="Date of birth" type="date" value={form.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
          <TextField label="SA ID number" span value={form.id_number} onChange={(v) => set("id_number", v)} maxLength={13} />
        </FieldGrid>
      )}

      {tab === "contact" && (
        <div className="space-y-6">
          <FieldGrid>
            <TextField label="Mobile" required type="tel" value={form.mobile} onChange={(v) => set("mobile", v)} placeholder="082 000 0000" />
            <TextField label="Landline" type="tel" value={form.phone} onChange={(v) => set("phone", v)} />
            <TextField label="Email" required span type="email" value={form.email} onChange={(v) => set("email", v)} />
          </FieldGrid>

          <div className="space-y-4 border-t border-border/40 pt-5">
            <AddressBlock form={form} set={set} prefix="addr" label="Primary address" />
            {showSecondAddr ? (
              <div className="border-t border-border/40 pt-4">
                <AddressBlock form={form} set={set} prefix="addr2" label="Additional address" onRemove={removeSecondAddr} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSecondAddr(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3.5" /> Add another address
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end border-t border-border/40 pt-4">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </ActionButton>
      </div>
    </div>
  )
}
