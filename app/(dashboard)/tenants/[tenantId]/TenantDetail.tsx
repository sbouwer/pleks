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
import { Plus, Trash2 } from "lucide-react"
import { CommunicationFeed } from "./CommunicationFeed"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string
  contact_id: string
  entity_type: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  registration_number: string | null
  vat_number: string | null
  contact_person: string | null
  id_number: string | null
  id_type: string | null
  date_of_birth: string | null
  nationality: string | null
  email: string | null
  phone: string | null
  employer_name: string | null
  employer_phone: string | null
  occupation: string | null
  employment_type: string | null
  preferred_contact: string | null
  blacklisted: boolean
  notes: string | null
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

interface TenancyHistory {
  id: string
  move_in_date: string
  move_out_date: string | null
  status: string
  units: { unit_number: string; properties: { name: string } } | null
}

interface CommEntry {
  id: string
  channel: string
  direction: string
  subject: string | null
  body: string | null
  status: string | null
  created_at: string
}

interface Props {
  tenant: Tenant
  phones: ContactPhone[]
  emails: ContactEmail[]
  addresses: ContactAddress[]
  history: TenancyHistory[]
  comms: CommEntry[]
  userRole: string
}

// ─── PhoneRow ─────────────────────────────────────────────────────────────────

function PhoneRow({
  phone,
  tenantId,
  contactId,
  onDone,
}: {
  phone: ContactPhone
  tenantId: string
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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
  tenantId,
  contactId,
  onDone,
}: {
  email: ContactEmail
  tenantId: string
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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
  tenantId,
  contactId,
  onDone,
}: {
  address: ContactAddress
  tenantId: string
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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
    const res = await fetch(`/api/tenants/${tenantId}/contact-details`, {
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

export function TenantDetail({
  tenant: initial,
  phones: initialPhones,
  emails: initialEmails,
  addresses: initialAddresses,
  history,
  comms,
  userRole,
}: Props) {
  const router = useRouter()
  const isIndividual = initial.entity_type === "individual"

  // ── Overview state ──────────────────────────────────────────────────────────
  const [entityType, setEntityType] = useState(initial.entity_type ?? "individual")
  const [firstName, setFirstName] = useState(initial.first_name ?? "")
  const [lastName, setLastName] = useState(initial.last_name ?? "")
  const [companyName, setCompanyName] = useState(initial.company_name ?? "")
  const [registrationNumber, setRegistrationNumber] = useState(initial.registration_number ?? "")
  const [vatNumber, setVatNumber] = useState(initial.vat_number ?? "")
  const [email, setEmail] = useState(initial.email ?? "")
  const [phone, setPhone] = useState(initial.phone ?? "")
  const [nationality, setNationality] = useState(initial.nationality ?? "")
  const [dateOfBirth, setDateOfBirth] = useState(
    initial.date_of_birth ? initial.date_of_birth.slice(0, 10) : ""
  )
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [savingOverview, setSavingOverview] = useState(false)

  // ── Employment state ────────────────────────────────────────────────────────
  const [employerName, setEmployerName] = useState(initial.employer_name ?? "")
  const [employerPhone, setEmployerPhone] = useState(initial.employer_phone ?? "")
  const [occupation, setOccupation] = useState(initial.occupation ?? "")
  const [employmentType, setEmploymentType] = useState(initial.employment_type ?? "")
  const [preferredContact, setPreferredContact] = useState(initial.preferred_contact ?? "")
  const [savingEmployment, setSavingEmployment] = useState(false)

  // ── Add contact detail state ────────────────────────────────────────────────
  const [showAddPhone, setShowAddPhone] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState("")
  const [newPhoneType, setNewPhoneType] = useState("mobile")
  const [newPhoneLabel, setNewPhoneLabel] = useState("")
  const [newPhoneWhatsapp, setNewPhoneWhatsapp] = useState(false)
  const [addingPhone, setAddingPhone] = useState(false)

  const [showAddEmail, setShowAddEmail] = useState(false)
  const [newEmailAddress, setNewEmailAddress] = useState("")
  const [newEmailType, setNewEmailType] = useState("personal")
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
    const isOrg = entityType === "organisation"
    const body: Record<string, unknown> = {
      tenantId: initial.id,
      contactId: initial.contact_id,
      entityType,
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      companyName: isOrg ? companyName.trim() || null : null,
      registrationNumber: isOrg ? registrationNumber.trim() || null : null,
      vatNumber: isOrg ? vatNumber.trim() || null : null,
      nationality: !isOrg ? nationality.trim() || null : null,
      dateOfBirth: !isOrg ? dateOfBirth || null : null,
    }
    const res = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSavingOverview(false)
    if (res.ok) { toast.success("Tenant updated"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  // ── Save employment ─────────────────────────────────────────────────────────
  async function handleSaveEmployment() {
    setSavingEmployment(true)
    const res = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: initial.id,
        contactId: initial.contact_id,
        employerName: employerName.trim() || null,
        employerPhone: employerPhone.trim() || null,
        occupation: occupation.trim() || null,
        employmentType: employmentType || null,
        preferredContact: preferredContact || null,
      }),
    })
    setSavingEmployment(false)
    if (res.ok) { toast.success("Employment details updated"); router.refresh() }
    else { const d = await res.json(); toast.error(d.error || "Failed to update") }
  }

  // ── Add phone ───────────────────────────────────────────────────────────────
  async function handleAddPhone() {
    if (!newPhoneNumber.trim()) { toast.error("Phone number is required"); return }
    setAddingPhone(true)
    const res = await fetch(`/api/tenants/${initial.id}/contact-details`, {
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
    const res = await fetch(`/api/tenants/${initial.id}/contact-details`, {
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
    const res = await fetch(`/api/tenants/${initial.id}/contact-details`, {
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

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        {isIndividual && <TabsTrigger value="employment">Employment</TabsTrigger>}
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="overview" className="space-y-6 pt-4">

        {/* Identity */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Identity</p>
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button type="button" onClick={() => setEntityType("individual")}
                  className={`px-3 py-1 transition-colors ${entityType === "individual" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}>
                  Individual
                </button>
                <button type="button" onClick={() => setEntityType("organisation")}
                  className={`px-3 py-1 transition-colors ${entityType === "organisation" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}>
                  Company
                </button>
              </div>
              {initial.blacklisted && (
                <Badge variant="destructive" className="text-[10px]">Blacklisted</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {entityType === "individual" ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">First Name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                  </div>
                  {initial.id_number && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">ID Number ({initial.id_type ?? "ID"})</Label>
                      <Input
                        value={initial.id_number.replace(/\S/g, "•").slice(0, -4) + initial.id_number.slice(-4)}
                        readOnly
                        className="font-mono text-muted-foreground bg-muted/40"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date of Birth</Label>
                    <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nationality</Label>
                    <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="South African" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company Name</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ABC Holdings (Pty) Ltd" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Registration Number</Label>
                    <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="2001/123456/07" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">First Name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Contact person" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Contact person" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">VAT Number</Label>
                    <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="4110123456" />
                  </div>
                </>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Primary Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Primary Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 000 0000" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this tenant…" rows={3} />
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
              <PhoneRow key={p.id} phone={p} tenantId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
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
              <EmailRow key={e.id} email={e} tenantId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
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
              <AddressRow key={a.id} address={a} tenantId={initial.id} contactId={initial.contact_id} onDone={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: EMPLOYMENT (individuals only)
      ══════════════════════════════════════════════════════════════════════ */}
      {isIndividual && (
        <TabsContent value="employment" className="pt-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <p className="text-sm font-medium text-foreground">Employment Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Employer Name</Label>
                  <Input value={employerName} onChange={(e) => setEmployerName(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Employer Phone</Label>
                  <Input value={employerPhone} onChange={(e) => setEmployerPhone(e.target.value)} placeholder="+27 11 000 0000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Occupation</Label>
                  <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Software Engineer" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Employment Type</Label>
                  <Select value={employmentType} onValueChange={(v) => v && setEmploymentType(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="self_employed">Self-employed</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="unemployed">Unemployed</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preferred Contact Method</Label>
                  <Select value={preferredContact} onValueChange={(v) => v && setPreferredContact(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="call">Phone Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <Button size="sm" onClick={handleSaveEmployment} disabled={savingEmployment}>
                {savingEmployment ? "Saving…" : "Save Employment Details"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: HISTORY
      ══════════════════════════════════════════════════════════════════════ */}
      <TabsContent value="history" className="space-y-6 pt-4">

        {/* Tenancy history */}
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium mb-3">Tenancy History</p>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No tenancy history yet.</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 text-sm py-2 border-b border-border/50 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                      {h.units && (
                        <span className="font-medium">
                          {h.units.properties.name} — {h.units.unit_number}
                        </span>
                      )}
                      <span className="text-muted-foreground ml-2">
                        {new Date(h.move_in_date).toLocaleDateString("en-ZA")}
                        {h.move_out_date && ` → ${new Date(h.move_out_date).toLocaleDateString("en-ZA")}`}
                      </span>
                    </div>
                    <span className="text-xs capitalize bg-surface-elevated px-2 py-0.5 rounded shrink-0">
                      {h.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Communications */}
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium mb-3">Communications</p>
            <CommunicationFeed tenantId={initial.id} initialComms={comms} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
