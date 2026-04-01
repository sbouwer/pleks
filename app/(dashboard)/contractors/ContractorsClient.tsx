"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search, Trash2, X, Plus, Check,
  ArrowUpDown, ArrowUp, ArrowDown,
  Pencil,
} from "lucide-react"

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

type SortKey = "company" | "contact" | "phone" | "email" | "status"
type SortDir = "asc" | "desc"

function SpecialityPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (v: string[]) => void }>) {
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

function SortIcon({ col, sortKey, sortDir }: Readonly<{ col: SortKey; sortKey: SortKey; sortDir: SortDir }>) {
  if (col !== sortKey) return <ArrowUpDown className="size-3.5 text-muted-foreground/50 ml-1 inline" />
  return sortDir === "asc"
    ? <ArrowUp className="size-3.5 text-brand ml-1 inline" />
    : <ArrowDown className="size-3.5 text-brand ml-1 inline" />
}

function ColHeader({ col, label, sortKey, sortDir, onSort }: Readonly<{ col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (col: SortKey) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </button>
  )
}

export function ContractorsClient({ contractors: initial, userRole }: Readonly<Props>) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("company")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const isOwner = userRole === "owner"

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(col)
      setSortDir("asc")
    }
  }

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
      let valA = ""
      let valB = ""
      if (sortKey === "company") {
        valA = (a.company_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase()
        valB = (b.company_name || `${b.first_name ?? ""} ${b.last_name ?? ""}`).toLowerCase()
      } else if (sortKey === "contact") {
        valA = `${a.last_name ?? ""} ${a.first_name ?? ""}`.toLowerCase().trim()
        valB = `${b.last_name ?? ""} ${b.first_name ?? ""}`.toLowerCase().trim()
      } else if (sortKey === "phone") {
        valA = a.phone ?? ""
        valB = b.phone ?? ""
      } else if (sortKey === "email") {
        valA = a.email?.toLowerCase() ?? ""
        valB = b.email?.toLowerCase() ?? ""
      } else if (sortKey === "status") {
        valA = a.is_active ? "a" : "b"
        valB = b.is_active ? "a" : "b"
      }
      const cmp = valA.localeCompare(valB)
      return sortDir === "asc" ? cmp : -cmp
    })

  const allSpecialities = Array.from(
    new Set(initial.flatMap((c) => c.specialities ?? []))
  ).sort((a, b) => a.localeCompare(b))

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
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
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
        {filtered.length} of {initial.length} contractor{initial.length === 1 ? "" : "s"}
        {activeFilter && ` · filtered by "${activeFilter}"`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No contractors match your search.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left">
                  <ColHeader col="company" label="Company" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">
                  <ColHeader col="contact" label="Primary Contact" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <ColHeader col="phone" label="Phone" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">
                  <ColHeader col="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-left hidden xl:table-cell">
                  <span className="text-xs font-medium text-muted-foreground">Specialities</span>
                </th>
                <th className="px-4 py-2.5 text-left">
                  <ColHeader col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const displayName = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed"
                const contactName = c.company_name
                  ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
                  : null
                const isDeleting = deletingId === c.id
                const visibleSpecialities = (c.specialities ?? []).slice(0, 2)
                const extraCount = (c.specialities ?? []).length - 2

                return (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/contractors/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm">{displayName}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-muted-foreground">
                        {contactName || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-muted-foreground">
                        {c.phone || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {c.email || <span className="text-muted-foreground/40">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {visibleSpecialities.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] bg-brand/8 text-brand">
                            {s}
                          </Badge>
                        ))}
                        {extraCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] bg-surface-elevated text-muted-foreground">
                            +{extraCount} more
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.is_active ? (
                        <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] bg-surface-elevated">Inactive</Badge>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          render={<Link href={`/contractors/${c.id}`} />}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(c)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AddContractorButton({ orgId, supplierType = "contractor" }: Readonly<{ orgId: string; supplierType?: string }>) {
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
        orgId, supplierType,
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

  const SUPPLIER_LABELS: Record<string, string> = {
    managing_scheme: "Managing Scheme",
    utility: "Utility",
    contractor: "Contractor",
  }
  const label = SUPPLIER_LABELS[supplierType] ?? "Contractor"

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" /> Add {label}
      </Button>
    )
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add {label.toLowerCase()}</p>
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
          {saving ? "Adding…" : `Add ${label.toLowerCase()}`}
        </Button>
      </CardContent>
    </Card>
  )
}
