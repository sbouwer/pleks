"use client"

/**
 * app/(dashboard)/dashboard/QuickAddMenu.tsx — dashboard "Quick add" dropdown (header action)
 *
 * Route:  /dashboard
 * Notes:  The AddButton-grammar primary opens a door dropdown (landlord / property / tenant / supplier
 *         / lease). Landlord/tenant/supplier launch the shared add-party modal in place; property
 *         launches the wizard; lease routes to /leases/new. Closes on outside click / Esc (the header's
 *         backdrop-filter would trap a fixed backdrop, so this uses a document listener).
 */
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, ChevronDown, UserSquare2, Home, Users, HardHat, FileText } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { PropertyWizardModal } from "@/app/(dashboard)/properties/new/PropertyWizardModal"
import { addLandlordParty, addTenantParty, addContractorParty } from "@/lib/actions/parties"
import type { AddPartyInput } from "@/lib/parties/partyValidation"
import type { PartyRole } from "@/lib/parties/partyConfig"

type ItemKey = PartyRole | "property" | "lease"

const ITEMS: { key: ItemKey; label: string; icon: LucideIcon }[] = [
  { key: "landlord", label: "Landlord", icon: UserSquare2 },
  { key: "property", label: "Property", icon: Home },
  { key: "tenant",   label: "Tenant",   icon: Users },
  { key: "supplier", label: "Supplier", icon: HardHat },
  { key: "lease",    label: "Lease",    icon: FileText },
]

export function QuickAddMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [party, setParty] = useState<PartyRole | null>(null)
  const [propertyOpen, setPropertyOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc) }
  }, [open])

  function pick(key: ItemKey) {
    setOpen(false)
    if (key === "property") setPropertyOpen(true)
    else if (key === "lease") router.push("/leases/new")
    else setParty(key)
  }

  function submitParty(input: AddPartyInput) {
    if (party === "landlord") return addLandlordParty(input)
    if (party === "tenant") return addTenantParty(input)
    return addContractorParty(input, "contractor")
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2.5 pl-2.5 pr-3.5 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
        <Plus className="h-4 w-4" />
        Quick add
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-50 min-w-[200px] overflow-hidden rounded-[var(--r-button)] border border-border bg-popover shadow-lg">
          {ITEMS.map((it) => {
            const Icon = it.icon
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => pick(it.key)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {it.label}
              </button>
            )
          })}
          <div aria-hidden className="h-1 w-full bg-primary" />
        </div>
      )}

      {party && (
        <AddPartyModal
          role={party}
          open
          onOpenChange={(o) => { if (!o) setParty(null) }}
          onSubmit={submitParty}
          onCreated={() => router.refresh()}
        />
      )}
      <PropertyWizardModal open={propertyOpen} onClose={() => setPropertyOpen(false)} />
    </div>
  )
}
