"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Search, Pencil, Trash2, X, Plus, Check } from "lucide-react"

export const SPECIALITY_OPTIONS = [
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Leak Detection",
  "Body Corporate",
  "Painting",
  "Tiling",
  "General Maintenance",
  "Locksmith",
  "HVAC / Air Con",
  "Waterproofing",
  "Gardening / Landscaping",
  "Cleaning",
  "Security",
  "Pest Control",
  "Roofing",
  "Glass & Glazing",
  "Appliance Repair",
]

export interface Contractor {
  id: string
  contact_id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  phone: string | null
  specialities: string[]
  is_active: boolean
}

interface Props {
  contractors: Contractor[]
  userRole: string
  orgId: string
}

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

function EditForm({
  contractor,
  onSave,
  onCancel,
}: {
  contractor: Contractor
  onSave: () => void
  onCancel: () => void
}) {
  const [firstName, setFirstName] = useState(contractor.first_name ?? "")
  const [lastName, setLastName] = useState(contractor.last_name ?? "")
  const [companyName, setCompanyName] = useState(contractor.company_name ?? "")
  const [email, setEmail] = useState(contractor.email ?? "")
  const [phone, setPhone] = useState(contractor.phone ?? "")
  const [specialities, setSpecialities] = useState<string[]>(contractor.specialities ?? [])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch("/api/contractors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractorId: contractor.id,
        contactId: contractor.contact_id,
        firstName,
        lastName,
        companyName,
        email,
        phone,
        specialities,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Contractor updated")
      onSave()
    } else {
      const d = await res.json()
      toast.error(d.error || "Failed to update")
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Company / Trading As</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="DW Plumbing" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">First name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Dean" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Last name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Wyld" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Specialities</Label>
        <SpecialityPicker value={specialities} onChange={setSpecialities} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

export function ContractorsClient({ contractors: initial, userRole, orgId }: Readonly<Props>) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isOwner = userRole === "owner"

  const filtered = initial
    .filter((c) => {
      const name = `${c.company_name ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase()
      const matchSearch = !search || name.includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      const matchFilter = !activeFilter || (c.specialities ?? []).includes(activeFilter)
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      const nameA = (a.company_name || `${a.first_name} ${a.last_name}`).toLowerCase()
      const nameB = (b.company_name || `${b.first_name} ${b.last_name}`).toLowerCase()
      return nameA.localeCompare(nameB)
    })

  // All specialities present across contractors for filter chips
  const allSpecialities = Array.from(
    new Set(initial.flatMap((c) => c.specialities ?? []))
  ).sort()

  async function handleDelete(c: Contractor) {
    setDeletingId(c.id)
    const res = await fetch("/api/contractors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorId: c.id, contactId: c.contact_id }),
    })
    setDeletingId(null)
    if (res.ok) {
      toast.success("Contractor removed")
      router.refresh()
    } else {
      const d = await res.json()
      toast.error(d.error || "Failed to delete")
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>

        {allSpecialities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allSpecialities.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveFilter(activeFilter === s ? null : s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeFilter === s
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-border text-muted-foreground hover:border-brand/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {initial.length} contractor{initial.length !== 1 ? "s" : ""}
        {activeFilter && ` · filtered by "${activeFilter}"`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No contractors match your search.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const displayName = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed"
            const contactName = c.company_name ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : null
            const isEditing = editingId === c.id
            const isDeleting = deletingId === c.id

            return (
              <Card key={c.id} className={isEditing ? "border-brand/30" : ""}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* Main info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{displayName}</p>
                        {!c.is_active && (
                          <Badge variant="secondary" className="text-[10px] bg-surface-elevated">Inactive</Badge>
                        )}
                      </div>
                      {contactName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{contactName}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                      </div>
                      {(c.specialities ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {c.specialities.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px] bg-brand/8 text-brand">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingId(isEditing ? null : c.id)}
                      >
                        {isEditing ? <X className="size-4" /> : <Pencil className="size-4" />}
                      </Button>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(c)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <EditForm
                      contractor={c}
                      onSave={() => { setEditingId(null); router.refresh() }}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AddContractorButton({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [specialities, setSpecialities] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!firstName.trim() && !companyName.trim()) {
      toast.error("Name or company is required")
      return
    }
    setSaving(true)
    const res = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: firstName.trim() || companyName.trim(),
        email, phone, companyName, specialities,
        orgId,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Contractor added")
      setOpen(false)
      setFirstName(""); setLastName(""); setCompanyName("")
      setEmail(""); setPhone(""); setSpecialities([])
      router.refresh()
    } else {
      const d = await res.json()
      toast.error(d.error || "Failed to add")
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> Add Contractor
      </Button>
    )
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add contractor</p>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Company / Trading As</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="DW Plumbing" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Dean" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Wyld" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Specialities</Label>
          <SpecialityPicker value={specialities} onChange={setSpecialities} />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={saving || (!firstName.trim() && !companyName.trim())}>
          {saving ? "Adding…" : "Add contractor"}
        </Button>
      </CardContent>
    </Card>
  )
}
