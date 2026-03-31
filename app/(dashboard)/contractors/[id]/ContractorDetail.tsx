"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Plus, Trash2, Check } from "lucide-react"
import { SPECIALITY_OPTIONS } from "../ContractorsClient"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contractor {
  id: string
  contact_id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  trading_as: string | null
  registration_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  specialities: string[]
  is_active: boolean
  notes: string | null
  call_out_rate_cents: number | null
  hourly_rate_cents: number | null
  banking_name: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_branch_code: string | null
  bank_account_type: string | null
  vat_registered: boolean
}

interface ContactPhone {
  id: string
  number: string
  phone_type: string
  label: string | null
  is_primary: boolean
  can_whatsapp: boolean
}

interface ContactEmail {
  id: string
  email: string
  email_type: string
  label: string | null
  is_primary: boolean
}

interface ContactAddress {
  id: string
  street_line1: string | null
  street_line2: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  address_type: string
  is_primary: boolean
}

interface ContractorContact {
  id: string
  contact_id: string
  role: string | null
  is_primary: boolean
  contacts: {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    primary_email: string | null
    primary_phone: string | null
  } | null
}

interface Props {
  contractor: Contractor
  phones: ContactPhone[]
  emails: ContactEmail[]
  addresses: ContactAddress[]
  contractorContacts: ContractorContact[]
  userRole: string
  orgId: string
}

// ─── SpecialityPicker ─────────────────────────────────────────────────────────

function SpecialityPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(s: string) {
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {SPECIALITY_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => toggle(s)}
          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
            value.includes(s)
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-muted-foreground hover:border-brand/50"
          }`}
        >
          {value.includes(s) && <Check className="inline size-3 mr-1" />}
          {s}
        </button>
      ))}
    </div>
  )
}

// ─── PhoneRow ─────────────────────────────────────────────────────────────────

function PhoneRow({
  phone,
  contractorId,
  contactId,
  onDone,
}: {
  phone: ContactPhone
  contractorId: string
  contactId: string
  onDone: () => void
}) {
  const [number, setNumber] = useState(phone.number)
  const [phoneType, setPhoneType] = useState(phone.phone_type)
  const [label, setLabel] = useState(phone.label ?? "")
  const [canWhatsapp, setCanWhatsapp] = useState(phone.can_whatsapp)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "phone", id: phone.id, contactId, number, phone_type: phoneType, label: label || null, can_whatsapp: canWhatsapp }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Phone updated"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "phone", id: phone.id, contactId }),
    })
    setDeleting(false)
    if (res.ok) { toast.success("Phone removed"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to delete") }
  }

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-center py-2 border-b border-border/50 last:border-0">
      <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Phone number" className="h-7 text-sm" />
      <Select value={phoneType} onValueChange={(v) => v && setPhoneType(v)}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mobile">Mobile</SelectItem>
          <SelectItem value="work">Work</SelectItem>
          <SelectItem value="home">Home</SelectItem>
          <SelectItem value="fax">Fax</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-sm" />
      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
        <input type="checkbox" checked={canWhatsapp} onChange={(e) => setCanWhatsapp(e.target.checked)} className="size-3.5" />
        WhatsApp
      </label>
      <div className="flex gap-1">
        <Button size="xs" onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</Button>
        <Button size="icon-xs" variant="ghost" onClick={handleDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── EmailRow ─────────────────────────────────────────────────────────────────

function EmailRow({
  email,
  contractorId,
  contactId,
  onDone,
}: {
  email: ContactEmail
  contractorId: string
  contactId: string
  onDone: () => void
}) {
  const [address, setAddress] = useState(email.email)
  const [emailType, setEmailType] = useState(email.email_type)
  const [label, setLabel] = useState(email.label ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", id: email.id, contactId, email: address, email_type: emailType, label: label || null }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Email updated"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", id: email.id, contactId }),
    })
    setDeleting(false)
    if (res.ok) { toast.success("Email removed"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to delete") }
  }

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center py-2 border-b border-border/50 last:border-0">
      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Email address" type="email" className="h-7 text-sm" />
      <Select value={emailType} onValueChange={(v) => v && setEmailType(v)}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">Personal</SelectItem>
          <SelectItem value="work">Work</SelectItem>
          <SelectItem value="billing">Billing</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-sm" />
      <div className="flex gap-1">
        <Button size="xs" onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</Button>
        <Button size="icon-xs" variant="ghost" onClick={handleDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── AddressRow ───────────────────────────────────────────────────────────────

const PROVINCES = [
  "Western Cape", "Eastern Cape", "Northern Cape", "North West",
  "Free State", "KwaZulu-Natal", "Gauteng", "Limpopo", "Mpumalanga",
]

function AddressRow({
  address,
  contractorId,
  contactId,
  onDone,
}: {
  address: ContactAddress
  contractorId: string
  contactId: string
  onDone: () => void
}) {
  const [streetLine1, setStreetLine1] = useState(address.street_line1 ?? "")
  const [suburb, setSuburb] = useState(address.suburb ?? "")
  const [city, setCity] = useState(address.city ?? "")
  const [province, setProvince] = useState(address.province ?? "")
  const [postalCode, setPostalCode] = useState(address.postal_code ?? "")
  const [addressType, setAddressType] = useState(address.address_type)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "address",
        id: address.id,
        contactId,
        street_line1: streetLine1 || null,
        suburb: suburb || null,
        city: city || null,
        province: province || null,
        postal_code: postalCode || null,
        address_type: addressType,
      }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Address updated"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/contractors/${contractorId}/contact-details`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "address", id: address.id, contactId }),
    })
    setDeleting(false)
    if (res.ok) { toast.success("Address removed"); onDone() }
    else { const d = await res.json(); toast.error(d.error || "Failed to delete") }
  }

  return (
    <div className="space-y-2 py-2 border-b border-border/50 last:border-0">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input value={streetLine1} onChange={(e) => setStreetLine1(e.target.value)} placeholder="Street address" className="h-7 text-sm" />
        <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" className="h-7 text-sm" />
        <Select value={addressType} onValueChange={(v) => v && setAddressType(v)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="physical">Physical</SelectItem>
            <SelectItem value="postal">Postal</SelectItem>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="work">Work</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-7 text-sm" />
        <Select value={province} onValueChange={(v) => v && setProvince(v)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Province" />
          </SelectTrigger>
          <SelectContent>
            {PROVINCES.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" className="h-7 text-sm" />
        <div className="flex gap-1">
          <Button size="xs" onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</Button>
          <Button size="icon-xs" variant="ghost" onClick={handleDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContractorDetail({
  contractor: initial,
  phones: initialPhones,
  emails: initialEmails,
  addresses: initialAddresses,
  contractorContacts: initialPeople,
  userRole,
  orgId,
}: Props) {
  const router = useRouter()
  const isOwner = userRole === "owner"

  // ── Overview state ──────────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState(initial.company_name ?? "")
  const [tradingAs, setTradingAs] = useState(initial.trading_as ?? "")
  const [registrationNumber, setRegistrationNumber] = useState(initial.registration_number ?? "")
  const [vatNumber, setVatNumber] = useState(initial.vat_number ?? "")
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [isActive, setIsActive] = useState(initial.is_active)
  const [specialities, setSpecialities] = useState<string[]>(initial.specialities)
  const [callOutRate, setCallOutRate] = useState(
    initial.call_out_rate_cents != null ? (initial.call_out_rate_cents / 100).toFixed(2) : ""
  )
  const [hourlyRate, setHourlyRate] = useState(
    initial.hourly_rate_cents != null ? (initial.hourly_rate_cents / 100).toFixed(2) : ""
  )
  const [savingOverview, setSavingOverview] = useState(false)

  // ── Banking state ───────────────────────────────────────────────────────────
  const [bankingName, setBankingName] = useState(initial.banking_name ?? "")
  const [bankName, setBankName] = useState(initial.bank_name ?? "")
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bank_account_number ?? "")
  const [bankBranchCode, setBankBranchCode] = useState(initial.bank_branch_code ?? "")
  const [bankAccountType, setBankAccountType] = useState(initial.bank_account_type ?? "")
  const [vatRegistered, setVatRegistered] = useState(initial.vat_registered ?? false)
  const [savingBanking, setSavingBanking] = useState(false)

  // ── People state ────────────────────────────────────────────────────────────
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [personFirstName, setPersonFirstName] = useState("")
  const [personLastName, setPersonLastName] = useState("")
  const [personEmail, setPersonEmail] = useState("")
  const [personPhone, setPersonPhone] = useState("")
  const [personRole, setPersonRole] = useState("")
  const [savingPerson, setSavingPerson] = useState(false)

  // ── Add contact detail state ────────────────────────────────────────────────
  const [showAddPhone, setShowAddPhone] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState("")
  const [newPhoneType, setNewPhoneType] = useState("mobile")
  const [newPhoneLabel, setNewPhoneLabel] = useState("")
  const [newPhoneWhatsapp, setNewPhoneWhatsapp] = useState(false)
  const [addingPhone, setAddingPhone] = useState(false)

  const [showAddEmail, setShowAddEmail] = useState(false)
  const [newEmailAddress, setNewEmailAddress] = useState("")
  const [newEmailType, setNewEmailType] = useState("work")
  const [newEmailLabel, setNewEmailLabel] = useState("")
  const [addingEmail, setAddingEmail] = useState(false)

  const [showAddAddress, setShowAddAddress] = useState(false)
  const [newStreetLine1, setNewStreetLine1] = useState("")
  const [newSuburb, setNewSuburb] = useState("")
  const [newCity, setNewCity] = useState("")
  const [newProvince, setNewProvince] = useState("")
  const [newPostalCode, setNewPostalCode] = useState("")
  const [newAddressType, setNewAddressType] = useState("physical")
  const [addingAddress, setAddingAddress] = useState(false)

  // ── Save overview ───────────────────────────────────────────────────────────
  async function handleSaveOverview() {
    setSavingOverview(true)
    const res = await fetch("/api/contractors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractorId: initial.id,
        contactId: initial.contact_id,
        companyName: companyName.trim() || null,
        tradingAs: tradingAs.trim() || null,
        registrationNumber: registrationNumber.trim() || null,
        vatNumber: vatNumber.trim() || null,
        notes: notes.trim() || null,
        isActive,
        specialities,
        callOutRateCents: callOutRate ? Math.round(parseFloat(callOutRate) * 100) : null,
        hourlyRateCents: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
      }),
    })
    setSavingOverview(false)
    if (res.ok) { toast.success("Contractor updated"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  // ── Save banking ────────────────────────────────────────────────────────────
  async function handleSaveBanking() {
    setSavingBanking(true)
    const res = await fetch("/api/contractors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractorId: initial.id,
        contactId: initial.contact_id,
        bankingName: bankingName.trim() || null,
        bankName: bankName.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        bankBranchCode: bankBranchCode.trim() || null,
        bankAccountType: bankAccountType || null,
        vatRegistered,
      }),
    })
    setSavingBanking(false)
    if (res.ok) { toast.success("Banking details updated"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  // ── Add phone ───────────────────────────────────────────────────────────────
  async function handleAddPhone() {
    if (!newPhoneNumber.trim()) { toast.error("Phone number is required"); return }
    setAddingPhone(true)
    const res = await fetch(`/api/contractors/${initial.id}/contact-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "phone",
        contactId: initial.contact_id,
        number: newPhoneNumber.trim(),
        phone_type: newPhoneType,
        label: newPhoneLabel.trim() || null,
        can_whatsapp: newPhoneWhatsapp,
        is_primary: initialPhones.length === 0,
      }),
    })
    setAddingPhone(false)
    if (res.ok) {
      toast.success("Phone added")
      setShowAddPhone(false); setNewPhoneNumber(""); setNewPhoneLabel(""); setNewPhoneWhatsapp(false)
      router.refresh()
    } else { const d = await res.json(); toast.error(d.error || "Failed to add") }
  }

  // ── Add email ───────────────────────────────────────────────────────────────
  async function handleAddEmail() {
    if (!newEmailAddress.trim()) { toast.error("Email address is required"); return }
    setAddingEmail(true)
    const res = await fetch(`/api/contractors/${initial.id}/contact-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        contactId: initial.contact_id,
        email: newEmailAddress.trim(),
        email_type: newEmailType,
        label: newEmailLabel.trim() || null,
        is_primary: initialEmails.length === 0,
      }),
    })
    setAddingEmail(false)
    if (res.ok) {
      toast.success("Email added")
      setShowAddEmail(false); setNewEmailAddress(""); setNewEmailLabel("")
      router.refresh()
    } else { const d = await res.json(); toast.error(d.error || "Failed to add") }
  }

  // ── Add address ─────────────────────────────────────────────────────────────
  async function handleAddAddress() {
    if (!newStreetLine1.trim()) { toast.error("Street address is required"); return }
    setAddingAddress(true)
    const res = await fetch(`/api/contractors/${initial.id}/contact-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "address",
        contactId: initial.contact_id,
        street_line1: newStreetLine1.trim(),
        suburb: newSuburb.trim() || null,
        city: newCity.trim() || null,
        province: newProvince || null,
        postal_code: newPostalCode.trim() || null,
        address_type: newAddressType,
        is_primary: initialAddresses.length === 0,
      }),
    })
    setAddingAddress(false)
    if (res.ok) {
      toast.success("Address added")
      setShowAddAddress(false); setNewStreetLine1(""); setNewSuburb(""); setNewCity(""); setNewProvince(""); setNewPostalCode("")
      router.refresh()
    } else { const d = await res.json(); toast.error(d.error || "Failed to add") }
  }

  // ── Add person ──────────────────────────────────────────────────────────────
  async function handleAddPerson() {
    if (!personFirstName.trim() && !personLastName.trim()) {
      toast.error("First or last name is required")
      return
    }
    setSavingPerson(true)
    const res = await fetch(`/api/contractors/${initial.id}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId,
        contractorId: initial.id,
        firstName: personFirstName.trim(),
        lastName: personLastName.trim(),
        email: personEmail.trim() || null,
        phone: personPhone.trim() || null,
        role: personRole.trim() || null,
      }),
    })
    setSavingPerson(false)
    if (res.ok) {
      toast.success("Person added")
      setShowAddPerson(false)
      setPersonFirstName(""); setPersonLastName(""); setPersonEmail(""); setPersonPhone(""); setPersonRole("")
      router.refresh()
    } else { const d = await res.json(); toast.error(d.error || "Failed to add") }
  }

  // ── Remove person ───────────────────────────────────────────────────────────
  async function handleRemovePerson(cc: ContractorContact) {
    const res = await fetch(`/api/contractors/${initial.id}/people`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorContactId: cc.id, contactId: cc.contact_id }),
    })
    if (res.ok) { toast.success("Person removed"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to remove") }
  }

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="banking">Banking</TabsTrigger>
      </TabsList>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="overview" className="space-y-6 pt-4">

        {/* Company info */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <p className="text-sm font-medium text-foreground">Company Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="DW Plumbing (Pty) Ltd" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Trading As (optional)</Label>
                <Input value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="DW Plumbing" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Registration Number (optional)</Label>
                <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="2001/123456/07" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">VAT Number (optional)</Label>
                <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="4110123456" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this contractor…" rows={3} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4"
                />
                Active contractor
              </label>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs">Specialities</Label>
              <SpecialityPicker value={specialities} onChange={setSpecialities} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Call-out Rate (R)</Label>
                <Input
                  value={callOutRate}
                  onChange={(e) => setCallOutRate(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hourly Rate (R)</Label>
                <Input
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>

            <Button size="sm" onClick={handleSaveOverview} disabled={savingOverview}>
              {savingOverview ? "Saving…" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Phones */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Phone Numbers</p>
              <Button size="xs" variant="outline" onClick={() => setShowAddPhone(!showAddPhone)}>
                <Plus className="size-3" /> Add Phone
              </Button>
            </div>

            {showAddPhone && (
              <div className="mb-3 p-3 rounded-lg bg-muted/40 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <Input value={newPhoneNumber} onChange={(e) => setNewPhoneNumber(e.target.value)} placeholder="Phone number" className="h-7 text-sm" />
                  <Select value={newPhoneType} onValueChange={(v) => v && setNewPhoneType(v)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">Mobile</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="home">Home</SelectItem>
                      <SelectItem value="fax">Fax</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={newPhoneLabel} onChange={(e) => setNewPhoneLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-sm" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={newPhoneWhatsapp} onChange={(e) => setNewPhoneWhatsapp(e.target.checked)} className="size-3.5" />
                    WhatsApp
                  </label>
                  <div className="flex gap-2">
                    <Button size="xs" onClick={handleAddPhone} disabled={addingPhone}>{addingPhone ? "Adding…" : "Add"}</Button>
                    <Button size="xs" variant="ghost" onClick={() => setShowAddPhone(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            {initialPhones.length === 0 && !showAddPhone && (
              <p className="text-xs text-muted-foreground py-2">No phone numbers yet.</p>
            )}
            {initialPhones.map((p) => (
              <PhoneRow key={p.id} phone={p} contractorId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>

        {/* Emails */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Email Addresses</p>
              <Button size="xs" variant="outline" onClick={() => setShowAddEmail(!showAddEmail)}>
                <Plus className="size-3" /> Add Email
              </Button>
            </div>

            {showAddEmail && (
              <div className="mb-3 p-3 rounded-lg bg-muted/40 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <Input value={newEmailAddress} onChange={(e) => setNewEmailAddress(e.target.value)} placeholder="email@example.com" type="email" className="h-7 text-sm" />
                  <Select value={newEmailType} onValueChange={(v) => v && setNewEmailType(v)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={newEmailLabel} onChange={(e) => setNewEmailLabel(e.target.value)} placeholder="Label (optional)" className="h-7 text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="xs" onClick={handleAddEmail} disabled={addingEmail}>{addingEmail ? "Adding…" : "Add"}</Button>
                  <Button size="xs" variant="ghost" onClick={() => setShowAddEmail(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {initialEmails.length === 0 && !showAddEmail && (
              <p className="text-xs text-muted-foreground py-2">No email addresses yet.</p>
            )}
            {initialEmails.map((e) => (
              <EmailRow key={e.id} email={e} contractorId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Addresses</p>
              <Button size="xs" variant="outline" onClick={() => setShowAddAddress(!showAddAddress)}>
                <Plus className="size-3" /> Add Address
              </Button>
            </div>

            {showAddAddress && (
              <div className="mb-3 p-3 rounded-lg bg-muted/40 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <Input value={newStreetLine1} onChange={(e) => setNewStreetLine1(e.target.value)} placeholder="Street address" className="h-7 text-sm" />
                  <Input value={newSuburb} onChange={(e) => setNewSuburb(e.target.value)} placeholder="Suburb" className="h-7 text-sm" />
                  <Select value={newAddressType} onValueChange={(v) => v && setNewAddressType(v)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="postal">Postal</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <Input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="City" className="h-7 text-sm" />
                  <Select value={newProvince} onValueChange={(v) => v && setNewProvince(v)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Province" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVINCES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={newPostalCode} onChange={(e) => setNewPostalCode(e.target.value)} placeholder="Postal code" className="h-7 text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="xs" onClick={handleAddAddress} disabled={addingAddress}>{addingAddress ? "Adding…" : "Add"}</Button>
                  <Button size="xs" variant="ghost" onClick={() => setShowAddAddress(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {initialAddresses.length === 0 && !showAddAddress && (
              <p className="text-xs text-muted-foreground py-2">No addresses yet.</p>
            )}
            {initialAddresses.map((a) => (
              <AddressRow key={a.id} address={a} contractorId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: PEOPLE
      ══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="people" className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Additional contacts associated with this contractor firm.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowAddPerson(!showAddPerson)}>
            <Plus className="size-4" /> Add Person
          </Button>
        </div>

        {showAddPerson && (
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-medium">Add Person</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">First Name</Label>
                  <Input value={personFirstName} onChange={(e) => setPersonFirstName(e.target.value)} placeholder="Dean" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Last Name</Label>
                  <Input value={personLastName} onChange={(e) => setPersonLastName(e.target.value)} placeholder="Wyld" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} type="email" placeholder="dean@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} placeholder="082 000 0000" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Role</Label>
                  <Input value={personRole} onChange={(e) => setPersonRole(e.target.value)} placeholder="Director, Site Foreman, Accounts…" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddPerson} disabled={savingPerson}>
                  {savingPerson ? "Adding…" : "Add Person"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddPerson(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {initialPeople.length === 0 && !showAddPerson && (
          <p className="text-sm text-muted-foreground py-8 text-center">No people added yet.</p>
        )}

        <div className="space-y-2">
          {initialPeople.map((cc) => {
            const c = cc.contacts
            const name = c
              ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company_name || "Unnamed"
              : "Unnamed"
            return (
              <Card key={cc.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      {cc.role && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5">{cc.role}</Badge>
                      )}
                      <div className="flex flex-wrap gap-x-3 mt-1">
                        {c?.primary_email && (
                          <p className="text-xs text-muted-foreground">{c.primary_email}</p>
                        )}
                        {c?.primary_phone && (
                          <p className="text-xs text-muted-foreground">{c.primary_phone}</p>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemovePerson(cc)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: BANKING
      ══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="banking" className="pt-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <p className="text-sm font-medium text-foreground">Banking Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Account Holder Name</Label>
                <Input value={bankingName} onChange={(e) => setBankingName(e.target.value)} placeholder="DW Plumbing (Pty) Ltd" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="First National Bank" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Number</Label>
                <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="62000000000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Branch Code</Label>
                <Input value={bankBranchCode} onChange={(e) => setBankBranchCode(e.target.value)} placeholder="250655" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Type</Label>
                <Select value={bankAccountType} onValueChange={(v) => v && setBankAccountType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                    <SelectItem value="transmission">Transmission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                className="size-4"
              />
              VAT registered
            </label>

            <Button size="sm" onClick={handleSaveBanking} disabled={savingBanking}>
              {savingBanking ? "Saving…" : "Save Banking Details"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
