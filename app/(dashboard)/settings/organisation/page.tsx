"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv", "Rev"]
const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]

interface OrgDetails {
  id: string
  type: "agency" | "landlord" | "sole_prop"
  // entity
  name: string | null
  trading_as: string | null
  reg_number: string | null
  eaab_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  // personal / primary contact
  title: string | null
  first_name: string | null
  last_name: string | null
  initials: string | null
  gender: string | null
  date_of_birth: string | null
  id_number: string | null
  mobile: string | null
  // structured address
  addr_line1: string | null
  addr_suburb: string | null
  addr_city: string | null
  addr_province: string | null
  addr_postal_code: string | null
}

type FormState = Omit<OrgDetails, "id" | "type">

function Field({
  label, id, required, help, children,
}: {
  label: string; id?: string; required?: boolean; help?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 mt-1">{children}</h3>
}

function SelectInput({ id, value, onChange, options, placeholder }: {
  id: string; value: string; onChange: (v: string) => void
  options: string[]; placeholder?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function PersonalSection({ form, set }: { form: FormState; set: (f: keyof FormState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeading>Personal details</SectionHeading>

      <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
        <Field label="Title" id="title">
          <SelectInput id="title" value={form.title ?? ""} onChange={(v) => set("title", v)} options={TITLES} />
        </Field>
        <Field label="First name" id="first_name" required>
          <Input id="first_name" value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
        </Field>
        <Field label="Last name" id="last_name" required>
          <Input id="last_name" value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Initials" id="initials" help="e.g. J.P.">
          <Input id="initials" value={form.initials ?? ""} onChange={(e) => set("initials", e.target.value)} className="w-24" />
        </Field>
        <Field label="Gender" id="gender">
          <SelectInput
            id="gender"
            value={form.gender ?? ""}
            onChange={(v) => set("gender", v)}
            options={["male", "female", "non_binary", "prefer_not_to_say"]}
            placeholder="Select…"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date of birth" id="date_of_birth">
          <Input id="date_of_birth" type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} />
        </Field>
        <Field label="SA ID number" id="id_number" help="13-digit South African ID number">
          <Input id="id_number" value={form.id_number ?? ""} onChange={(e) => set("id_number", e.target.value)} maxLength={13} />
        </Field>
      </div>
    </div>
  )
}

function ContactSection({ form, set, phonLabel = "Landline" }: {
  form: FormState; set: (f: keyof FormState, v: string) => void; phonLabel?: string
}) {
  return (
    <div className="space-y-4">
      <SectionHeading>Contact details</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Mobile" id="mobile" required>
          <Input id="mobile" type="tel" value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} placeholder="082 000 0000" />
        </Field>
        <Field label={phonLabel} id="phone">
          <Input id="phone" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="021 000 0000" />
        </Field>
      </div>
      <Field label="Email" id="email" required>
        <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
    </div>
  )
}

function AddressSection({ form, set, label = "Residential address" }: {
  form: FormState; set: (f: keyof FormState, v: string) => void; label?: string
}) {
  return (
    <div className="space-y-4">
      <SectionHeading>{label}</SectionHeading>
      <Field label="Street address" id="addr_line1" required>
        <Input id="addr_line1" value={form.addr_line1 ?? ""} onChange={(e) => set("addr_line1", e.target.value)} placeholder="14 Rose Street" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Suburb" id="addr_suburb">
          <Input id="addr_suburb" value={form.addr_suburb ?? ""} onChange={(e) => set("addr_suburb", e.target.value)} placeholder="Paarl" />
        </Field>
        <Field label="City / Town" id="addr_city" required>
          <Input id="addr_city" value={form.addr_city ?? ""} onChange={(e) => set("addr_city", e.target.value)} placeholder="Cape Town" />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-4">
        <Field label="Province" id="addr_province" required>
          <SelectInput id="addr_province" value={form.addr_province ?? ""} onChange={(v) => set("addr_province", v)} options={PROVINCES} placeholder="Select province…" />
        </Field>
        <Field label="Postal code" id="addr_postal_code">
          <Input id="addr_postal_code" value={form.addr_postal_code ?? ""} onChange={(e) => set("addr_postal_code", e.target.value)} placeholder="7646" maxLength={4} />
        </Field>
      </div>
    </div>
  )
}

export default function OrganisationPage() {
  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [form, setForm] = useState<FormState>({} as FormState)
  const [showVat, setShowVat] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/org/details")
      .then((r) => r.json())
      .then((data: OrgDetails) => {
        setOrg(data)
        setForm(data)
        if (data.vat_number) setShowVat(true)
      })
  }, [])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value || null }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success("Details saved")
      } else {
        toast.error("Failed to save")
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!org) return null

  const type = org.type

  const saveButton = (
    <div className="flex justify-end pt-2">
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  )

  // ── Landlord (owner) variant ─────────────────────────────────────────────────
  if (type === "landlord") {
    return (
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl mb-1">Your details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your personal information appears on leases and tenant communications.
        </p>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <PersonalSection form={form} set={set} />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ContactSection form={form} set={set} phonLabel="Landline" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Residential address</CardTitle></CardHeader>
          <CardContent>
            <AddressSection form={form} set={set} label="" />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    )
  }

  // ── Sole proprietor variant ──────────────────────────────────────────────────
  if (type === "sole_prop") {
    return (
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl mb-1">Business details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your business information appears on leases, invoices, and communications.
        </p>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <PersonalSection form={form} set={set} />
            <ContactSection form={form} set={set} phonLabel="Landline" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Business information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Business name" id="trading_as" help="If you trade under a different name. Leave blank to use your full name.">
              <Input id="trading_as" value={form.trading_as ?? ""} onChange={(e) => set("trading_as", e.target.value)} />
            </Field>
            <Field label="EAAB / FFC number" id="eaab_number" help="Not required for landlords managing own properties.">
              <Input id="eaab_number" value={form.eaab_number ?? ""} onChange={(e) => set("eaab_number", e.target.value)} />
            </Field>
            <Field label="Email" id="email" required>
              <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Website" id="website">
              <Input id="website" type="url" placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <div className="pt-1">
              {showVat ? (
                <Field label="VAT number" id="vat_number">
                  <Input id="vat_number" value={form.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} />
                </Field>
              ) : (
                <button type="button" onClick={() => setShowVat(true)}
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors">
                  VAT registered? Add VAT number
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Business address</CardTitle></CardHeader>
          <CardContent>
            <AddressSection form={form} set={set} label="" />
          </CardContent>
        </Card>

        <div className="flex justify-end">{saveButton}</div>
      </div>
    )
  }

  // ── Agency variant ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-3xl mb-1">Organisation details</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your company information appears on all documents, invoices, and communications.
      </p>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <PersonalSection form={form} set={set} />
          <ContactSection form={form} set={set} phonLabel="Direct line" />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Company information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Legal entity name" id="name" required>
            <Input id="name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Trading as" id="trading_as">
            <Input id="trading_as" value={form.trading_as ?? ""} onChange={(e) => set("trading_as", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="CIPC registration" id="reg_number" required>
              <Input id="reg_number" value={form.reg_number ?? ""} onChange={(e) => set("reg_number", e.target.value)} placeholder="2020/123456/07" />
            </Field>
            <Field label="EAAB / FFC number" id="eaab_number" required>
              <Input id="eaab_number" value={form.eaab_number ?? ""} onChange={(e) => set("eaab_number", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="VAT number" id="vat_number">
              <Input id="vat_number" value={form.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} />
            </Field>
            <Field label="Email" id="email" required>
              <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
          <Field label="Website" id="website">
            <Input id="website" type="url" placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Registered address</CardTitle></CardHeader>
        <CardContent>
          <AddressSection form={form} set={set} label="" />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  )
}
