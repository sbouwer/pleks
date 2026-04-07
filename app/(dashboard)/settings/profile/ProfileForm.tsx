"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Info, Plus, X } from "lucide-react"

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv", "Rev"]
const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]
const ADDRESS_TYPES = ["residential", "postal", "work", "business", "other"]

export interface OrgDetails {
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
  primary_contact_is_user: boolean
}

type FormState = Omit<OrgDetails, "id" | "type" | "primary_contact_is_user">

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

function Sel({ id, value, onChange, options, placeholder, capitalize, className }: Readonly<{
  id: string; value: string; onChange: (v: string) => void
  options: string[]; placeholder?: string; capitalize?: boolean; className?: string
}>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id} className={`h-9 text-sm ${className ?? "w-full"}`}>
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {capitalize ? o.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SecHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
      {children}
    </p>
  )
}

// ── Address block ─────────────────────────────────────────────────────────────

function AddressBlock({ prefix, form, set, onRemove }: Readonly<{
  prefix: "addr" | "addr2"
  form: FormState
  set: (f: keyof FormState, v: string) => void
  onRemove?: () => void
}>) {
  const t = (col: string) => `${prefix}_${col}` as keyof FormState
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 shrink-0">
          {prefix === "addr" ? "Primary" : "Additional"}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <Sel id={t("type")} value={form[t("type")] ?? ""}
            onChange={(v) => set(t("type"), v)} options={ADDRESS_TYPES}
            placeholder="Type…" capitalize className="w-36" />
          {onRemove && (
            <button type="button" onClick={onRemove}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
              <X className="size-4" />
            </button>
          )}
        </div>
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
      <div className="grid grid-cols-[calc(200px+0.75rem)_1fr_1fr] gap-3">
        <F label="Gender" id="gender">
          <Sel id="gender" value={form.gender ?? ""} onChange={(v) => set("gender", v)}
            options={["male", "female", "prefer_not_to_say"]}
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
    <div className="space-y-3">
      <AddressBlock prefix="addr" form={form} set={set} />
      {showSecond ? (
        <div className="border-t border-border/40 pt-4">
          <AddressBlock prefix="addr2" form={form} set={set} onRemove={onRemoveSecond} />
        </div>
      ) : (
        <button type="button" onClick={onAddSecond}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="size-3.5" /> Add another address
        </button>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function ProfileForm({ initialData }: Readonly<{ initialData: OrgDetails }>) {
  const type = initialData.type
  const [form, setForm] = useState<FormState>(initialData)
  const [showVat, setShowVat] = useState(!!initialData.vat_number)
  const [showSecondAddr, setShowSecondAddr] = useState(!!initialData.addr2_line1)
  const [saving, setSaving] = useState(false)
  const [primaryContactIsUser, setPrimaryContactIsUser] = useState<boolean>(initialData.primary_contact_is_user ?? true)
  const [showContactPrompt, setShowContactPrompt] = useState(false)

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
      if (res.ok) {
        toast.success("Details saved")
        if (type !== "landlord" && form.email && primaryContactIsUser !== false) {
          setShowContactPrompt(true)
        }
      } else {
        toast.error("Failed to save")
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function dismissContactPrompt(willUseSystem: boolean) {
    setShowContactPrompt(false)
    if (!willUseSystem) {
      setPrimaryContactIsUser(false)
      await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_contact_is_user: false }),
      })
    }
  }

  const saveBtn = (
    <div className="space-y-3 pt-2">
      {showContactPrompt && (
        <div className="flex items-start gap-3 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
          <Info className="size-4 shrink-0 mt-0.5 text-brand" />
          <div className="flex-1">
            <p className="font-medium text-sm">Is this person a system user?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {form.first_name ?? "The primary contact"} doesn&apos;t need a Pleks account — their details still appear on leases and documents.
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => dismissContactPrompt(true)}>
                They&apos;ll use the system
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => dismissContactPrompt(false)}>
                They won&apos;t be using the system
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  )

  const agencyInfoNote = (
    <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 mb-4 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0 mt-0.5" />
      <span>
        The primary contact is the person legally responsible for the organisation.
        Their details appear on leases and official documents.
        They don&apos;t need to be a system user — add team members separately in{" "}
        <a href="/settings/team" className="underline underline-offset-2">Settings &rarr; Team</a>.
      </span>
    </div>
  )

  if (type === "landlord") {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-1">Your details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your personal information appears on leases and tenant communications.
        </p>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
          <CardContent><PersonalSection form={form} set={set} /></CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
            <CardContent><ContactSection form={form} set={set} phoneLabel="Landline" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
            <CardContent>
              <AddressesSection form={form} set={set} showSecond={showSecondAddr}
                onAddSecond={() => setShowSecondAddr(true)} onRemoveSecond={removeSecondAddr} />
            </CardContent>
          </Card>
        </div>
        {saveBtn}
      </div>
    )
  }

  if (type === "sole_prop") {
    return (
      <div>
        <h1 className="font-heading text-3xl mb-1">Business details</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your business information appears on leases, invoices, and communications.
        </p>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
          <CardContent><PersonalSection form={form} set={set} /></CardContent>
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
              <AddressesSection form={form} set={set} showSecond={showSecondAddr}
                onAddSecond={() => setShowSecondAddr(true)} onRemoveSecond={removeSecondAddr} />
            </CardContent>
          </Card>
        </div>
        {saveBtn}
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-1">Organisation details</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your company information appears on all documents, invoices, and communications.
      </p>
      {agencyInfoNote}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Primary contact</CardTitle></CardHeader>
        <CardContent><PersonalSection form={form} set={set} /></CardContent>
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
            <AddressesSection form={form} set={set} showSecond={showSecondAddr}
              onAddSecond={() => setShowSecondAddr(true)} onRemoveSecond={removeSecondAddr} />
          </CardContent>
        </Card>
      </div>
      {saveBtn}
    </div>
  )
}
