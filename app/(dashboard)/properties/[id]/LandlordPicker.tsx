"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import Link from "next/link"
import { Search, X, Plus, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { assignLandlord } from "./actions"

interface Landlord {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
}

interface LandlordPickerProps {
  propertyId: string
  orgId: string
  landlords: Landlord[]
  current: Landlord | null
}

function getName(l: Landlord) {
  return l.company_name?.trim() || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unknown"
}

function getInitials(l: Landlord) {
  if (l.company_name) return l.company_name.slice(0, 2).toUpperCase()
  const f = l.first_name?.trim()[0] ?? ""
  const s = l.last_name?.trim()[0] ?? ""
  return (f + s).toUpperCase() || "?"
}

function getWaNumber(phone: string) {
  const digits = phone.replaceAll(/\D/g, "")
  return digits.startsWith("0") ? `27${digits.slice(1)}` : digits
}

export function LandlordPicker({ propertyId, orgId, landlords, current }: Readonly<LandlordPickerProps>) {
  const [open, setOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  // Add form state
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowAddForm(false)
        setSearch("")
      }
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = landlords.filter((l) => {
    const q = search.toLowerCase()
    return (
      getName(l).toLowerCase().includes(q) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      (l.phone?.includes(q) ?? false)
    )
  })

  function handleSelect(landlordId: string) {
    startTransition(async () => {
      await assignLandlord(propertyId, landlordId)
      setOpen(false)
      setSearch("")
    })
  }

  function handleRemove() {
    startTransition(async () => {
      await assignLandlord(propertyId, null)
      setOpen(false)
    })
  }

  async function handleAddAndAssign() {
    if (!firstName.trim() && !lastName.trim()) {
      toast.error("Name is required")
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/landlords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, orgId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to add landlord")
        return
      }
      await assignLandlord(propertyId, data.landlordId)
      toast.success(`${firstName} ${lastName} added and assigned`)
      setFirstName("")
      setLastName("")
      setEmail("")
      setPhone("")
      setShowAddForm(false)
      setOpen(false)
    })
  }

  // When landlord is assigned — show name + contact buttons + Change/Remove
  if (current && !open) {
    const name = getName(current)
    const initials = getInitials(current)
    const waNumber = current.phone ? getWaNumber(current.phone) : null

    return (
      <div ref={containerRef}>
        <Link href={`/landlords/${current.id}`} className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity">
          <div className="h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-medium shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-medium text-sm">{name}</p>
            <p className="text-xs text-muted-foreground">Owner</p>
          </div>
        </Link>
        <div className="flex gap-2 flex-wrap mb-3">
          {current.phone && (
            <a href={`tel:${current.phone}`} className="flex-1 sm:flex-none">
              <Button size="sm" variant="outline" className="w-full">Call</Button>
            </a>
          )}
          {current.email && (
            <a href={`mailto:${current.email}`} className="flex-1 sm:flex-none">
              <Button size="sm" variant="outline" className="w-full">Email</Button>
            </a>
          )}
          {current.phone && waNumber && (
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
              <Button size="sm" variant="outline" className="w-full">WhatsApp</Button>
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => setOpen(true)}>
            Change
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-danger hover:text-danger" onClick={handleRemove} disabled={isPending}>
            Remove
          </Button>
        </div>
      </div>
    )
  }

  // Picker open state (or no current landlord)
  return (
    <div ref={containerRef} className="relative">
      {current && open ? (
        // Changing — show compact current + dismiss
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Changing from <span className="font-medium text-foreground">{getName(current)}</span></span>
          <button onClick={() => { setOpen(false); setSearch("") }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {showAddForm ? (
        /* Inline add form */
        <div className="rounded-lg border bg-surface p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New landlord</p>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">First name *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="082 000 0000" />
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleAddAndAssign}
            disabled={isPending || (!firstName.trim() && !lastName.trim())}
          >
            {isPending ? "Adding..." : "Add & assign"}
          </Button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-brand/50 hover:text-foreground transition-colors"
          >
            <span>{current ? "Change landlord" : "Assign landlord"}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search landlords..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {search && (
                  <button onClick={() => setSearch("")}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-52 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground text-center">No landlords found</p>
                )}
                {filtered.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => handleSelect(l.id)}
                    disabled={isPending}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                      {getInitials(l)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{getName(l)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.phone, l.email].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Add new */}
              <div className="border-t">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-brand hover:bg-accent transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add new landlord
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
