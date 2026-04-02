"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Plus, X } from "lucide-react"

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv", "Rev"]
const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]
const ADDRESS_TYPES = ["residential", "postal", "work", "business", "other"]

interface OrgDetails {
  id: string
  type: "agency" | "landlord" | "sole_prop"
  name: string | null
  trading_as: string | null
  reg_number: string | null
  eaab_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  title: string | null
  first_name: string | null
  last_name: string | null
  initials: string | null
  gender: string | null
  date_of_birth: string | null
  id_number: string | null
  mobile: string | null
  addr_type: string | null
  addr_line1: string | null
  addr_suburb: string | null
  addr_city: string | null
  addr_province: string | null
  addr_postal_code: string | null
  addr2_type: string | null
  addr2_line1: string | null
  addr2_suburb: string | null
  addr2_city: string | null
  addr2_province: string | null
  addr2_postal_code: string | null
}

type FormState = Omit<OrgDetails, "id" | "type">

// ── Shared primitives ──────────────────────────────────────────────────────────

function F({ label, id, required, help, children }: Readonly<{
  label: string; id?: string; required?: boolean; help?: string; children: React.ReactNode
}>) {
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

function Sel({ id, value, onChange, options, placeholder, capitalize }: Readonly<{
  id: string; value: string; onChange: (v: string) => void
  options: string[]; placeholder?: string; capitalize?: boolean
}>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-sans shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o} value={o}>{capitalize ? o.charAt(0).toUpperCase() + o.slice(1) : o}</option>
      ))}
    </select>
  )
}

function SecHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
      {children}
    </p>
  )
}

// ── Address block (used for addr and addr2) ───────────────────────────────────

function AddressBlock({ prefix, form, set, onRemove }: Readonly<{
  prefix: "addr" | "addr2"
  form: FormState
  set: (f: keyof FormState, v: string) => void
  onRemove?: () => void
}>) {
  const t = (col: string) => `${prefix}_${col}` as keyof FormState
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <F label="Address type" id={t("type")}>
          <Sel
            id={t("type")}
            value={(form[t("type")] as string) ?? ""}
            onChange={(v) => set(t("type"), v)}
            options={ADDRESS_TYPES}
            placeholder="Select type…"
            capitalize
          />
        </F>
        {onRemove && (
          <button type="button" onClick={onRemove}
            className="ml-3 mt-5 text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <X className="size-4" />
          </button>
        )}
      </div>
      <F label="Street address" id={t("line1")} required>
        <Input id={t("line1")} value={(form[t("line1")] as string) ?? ""}
          onChange={(e) => set(t("line1"), e.target.value)} placeholder="14 Rose Street" />
      </F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Suburb" id={t("suburb")}>
          <Input id={t("suburb")} value={(form[t("suburb")] as string) ?? ""}
            onChange={(e) => set(t("suburb"), e.target.value)} />
        </F>
        <F label="City / Town" id={t("city")} required>
          <Input id={t("city")} value={(form[t("city")] as string) ?? ""}
            onChange={(e) => set(t("city"), e.target.value)} />
        </F>
      </div>
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <F label="Province" id={t("province")} required>
          <Sel id={t("province")} value={(form[t("province")] as string) ?? ""}
            onChange={(v) => set(t("province"), v)} options={PROVINCES} placeholder="Province…" />
        </F>
        <F label="Postal code" id={t("postal_code")}>
          <Input id={t("postal_code")} value={(form[t("postal_code")] as string) ?? ""}
            onChange={(e) => set(t("postal_code"), e.target.value)} maxLength={4} />
        </F>
      </div>
    </div>
  )
}

// ── Section components ────────────────────────────────────────────────────────

function PersonalSection({ form, set }: Readonly<{ form: FormState; set: (f: keyof FormState, v: string) => void }>) {
  return (
    <div className="space-y-4">
      {/* Row 1: Title + Initials + First name + Last name */}
      <div className="grid grid-cols-[100px_100px_1fr_1fr] gap-3">
        <F label="Title" id="title">
          <Sel id="title" value={form.title ?? ""} onChange={(v) => set("title", v)} options={TITLES} />
        </F>
        <F label="Initials" id="initials" help="e.g. J.P.">
          <Input id="initials" value={form.initials ?? ""} onChange={(e) => set("initials", e.target.value)} />
        </F>
        <F label="First name" id="first_name" required>
          <Input id="first_name" value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
        </F>
        <F label="Last name" id="last_name" required>
          <Input id="last_name" value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
        </F>
      </div>
      {/* Row 2: Gender + DOB + SA ID */}
      <div className="grid grid-cols-3 gap-3">
        <F label="Gender" id="gender">
          <Sel id="gender" value={form.gender ?? ""} onChange={(v) => set("gender", v)}
            options={["male", "female", "non_binary", "prefer_not_to_say"]}
            capitalize placeholder="Select…" />
        </F>
        <F label="Date of birth" id="date_of_birth">
          <Input id="date_of_birth" type="date" value={form.date_of_birth ?? ""}
            onChange={(e) => set("date_of_birth", e.target.value)} />
        </F>
        <F label="SA ID number" id="id_number">
          <Input id="id_number" value={form.id_number ?? ""}
            onChange={(e) => set("id_number", e.target.value)} maxLength={13} />
        </F>
      </div>
    </div>
  )
}

function ContactSection({ form, set, phoneLabel = "Landline" }: Readonly<{
  form: FormState; set: (f: keyof FormState, v: string) => void; phoneLabel?: string
}>) {
  return (
    <div className="space-y-4">
      <SecHeading>Contact details</SecHeading>
      <div className="grid grid-cols-2 gap-3">
        <F label="Mobile" id="mobile" required>
          <Input id="mobile" type="tel" value={form.mobile ?? ""}
            onChange={(e) => set("mobile", e.target.value)} placeholder="082 000 0000" />
        </F>
        <F label={phoneLabel} id="phone">
          <Input id="phone" type="tel" value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)} placeholder="021 000 0000" />
        </F>
      </div>
      <F label="Email" id="email" required>
        <Input id="email" type="email" value={form.email ?? ""}
          onChange={(e) => set("email", e.target.value)} />
      </F>
    </div>
  )
}

function AddressesSection({ form, set, showSecond, onAddSecond, onRemoveSecond }: Readonly<{
  form: FormState
  set: (f: keyof FormState, v: string) => void
  showSecond: boolean
  onAddSecond: () => void
  onRemoveSecond: () => void
}>) {
  return (
    <div className="space-y-5">
      <SecHeading>Address</SecHeading>
      <AddressBlock prefix="addr" form={form} set={set} />
      {showSecond ? (
        <>
          <div className="border-t border-border/40 pt-4">
            <AddressBlock prefix="addr2" form={form} set={set} onRemove={onRemoveSecond} />
          </div>
        </>
      ) : (
        <button type="button" onClick={onAddSecond}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="size-3.5" /> Add another address
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrganisationPage() {
  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [form, setForm] = useState<FormState>({} as FormState)
  const [showVat, setShowVat] = useState(false)
  const [showSecondAddr, setShowSecondAddr] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/org/details")
      .then((r) => r.json())
      .then((data: OrgDetails) => {
        setOrg(data)
        setForm(data)
        if (data.vat_number) setShowVat(true)
        if (data.addr2_line1) setShowSecondAddr(true)
      })
  }, [])

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
      const res = await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      toast[res.ok ? "success" : "error"](res.ok ? "Details saved" : "Failed to save")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!org) return null

  const type = org.type

  const saveBtn = (
    <div className="flex justify-end pt-2">
      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
    </div>
  )

  // ── Landlord ─────────────────────────────────────────────────────────────────
  if (type === "landlord") {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-1">Your details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your personal information appears on leases and tenant communications.
        </p>

        {/* Personal info — full width */}
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
          <CardContent>
            <PersonalSection form={form} set={set} />
          </CardContent>
        </Card>

        {/* Contact + Address — side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
            <CardContent>
              <ContactSection form={form} set={set} phoneLabel="Landline" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
            <CardContent>
              <AddressesSection
                form={form} set={set}
                showSecond={showSecondAddr}
                onAddSecond={() => setShowSecondAddr(true)}
                onRemoveSecond={removeSecondAddr}
              />
            </CardContent>
          </Card>
        </div>

        {saveBtn}
      </div>
    )
  }

  // ── Sole proprietor ───────────────────────────────────────────────────────────
  if (type === "sole_prop") {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-1">Business details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your business information appears on leases, invoices, and communications.
        </p>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
          <CardContent>
            <PersonalSection form={form} set={set} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact &amp; business</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ContactSection form={form} set={set} phoneLabel="Landline" />
              <div className="border-t border-border/40 pt-4 space-y-4">
                <SecHeading>Business details</SecHeading>
                <F label="Business name" id="trading_as" help="Leave blank to use your full name.">
                  <Input id="trading_as" value={form.trading_as ?? ""} onChange={(e) => set("trading_as", e.target.value)} />
                </F>
                <F label="EAAB / FFC number" id="eaab_number" help="Not required for landlords managing own properties.">
                  <Input id="eaab_number" value={form.eaab_number ?? ""} onChange={(e) => set("eaab_number", e.target.value)} />
                </F>
                <F label="Website" id="website">
                  <Input id="website" type="url" placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
                </F>
                {showVat ? (
                  <F label="VAT number" id="vat_number">
                    <Input id="vat_number" value={form.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} />
                  </F>
                ) : (
                  <button type="button" onClick={() => setShowVat(true)}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors">
                    VAT registered? Add VAT number
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
            <CardContent>
              <AddressesSection
                form={form} set={set}
                showSecond={showSecondAddr}
                onAddSecond={() => setShowSecondAddr(true)}
                onRemoveSecond={removeSecondAddr}
              />
            </CardContent>
          </Card>
        </div>

        {saveBtn}
      </div>
    )
  }

  // ── Agency ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="font-heading text-3xl mb-1">Organisation details</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your company information appears on all documents, invoices, and communications.
      </p>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
        <CardContent>
          <PersonalSection form={form} set={set} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Company &amp; contact</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <SecHeading>Company information</SecHeading>
            <F label="Legal entity name" id="name" required>
              <Input id="name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            </F>
            <F label="Trading as" id="trading_as">
              <Input id="trading_as" value={form.trading_as ?? ""} onChange={(e) => set("trading_as", e.target.value)} />
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F label="CIPC registration" id="reg_number" required>
                <Input id="reg_number" value={form.reg_number ?? ""} onChange={(e) => set("reg_number", e.target.value)} placeholder="2020/123456/07" />
              </F>
              <F label="EAAB / FFC number" id="eaab_number" required>
                <Input id="eaab_number" value={form.eaab_number ?? ""} onChange={(e) => set("eaab_number", e.target.value)} />
              </F>
            </div>
            <F label="VAT number" id="vat_number">
              <Input id="vat_number" value={form.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} />
            </F>
            <div className="border-t border-border/40 pt-4">
              <ContactSection form={form} set={set} phoneLabel="Direct line" />
            </div>
            <F label="Website" id="website">
              <Input id="website" type="url" placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
            </F>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent>
            <AddressesSection
              form={form} set={set}
              showSecond={showSecondAddr}
              onAddSecond={() => setShowSecondAddr(true)}
              onRemoveSecond={removeSecondAddr}
            />
          </CardContent>
        </Card>
      </div>

      {saveBtn}
    </div>
  )
}
