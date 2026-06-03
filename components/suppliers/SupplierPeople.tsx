"use client"

/**
 * components/suppliers/SupplierPeople.tsx — the identity card's "primary contact + N more" → people modal
 *
 * Auth:   client island; people mutations go through CompanyPeopleSection's server actions
 * Data:   CompanyPerson[] passed from the detail page
 * Notes:  Replaces the separate People card. The identity card shows the primary contact (clickable); the
 *         modal hosts the full people list + add/remove (CompanyPeopleSection in its bare variant).
 */
import { useState } from "react"
import { Users } from "lucide-react"
import { Modal } from "@/components/ui/actions"
import { CompanyPeopleSection } from "@/components/contacts/CompanyPeopleSection"
import type { CompanyPerson } from "@/lib/contacts/companyPeople"

export function SupplierPeople({
  people, companyContactId,
}: Readonly<{ people: CompanyPerson[]; companyContactId: string }>) {
  const [open, setOpen] = useState(false)
  const primary = people.find((p) => p.isPrimary) ?? people[0] ?? null
  const extra = Math.max(0, people.length - 1)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 text-left text-sm transition-colors hover:text-brand"
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {primary?.name ?? "Add people"}
          {extra > 0 && <span className="text-muted-foreground"> · +{extra} more</span>}
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="People">
        <CompanyPeopleSection people={people} companyContactId={companyContactId} fica={false} variant="bare" />
      </Modal>
    </>
  )
}
