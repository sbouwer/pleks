"use client"

/**
 * components/suppliers/SupplierPeople.tsx — the identity card's "primary contact + N more" → people modal
 *
 * Auth:   client island; people mutations go through the company-contacts server actions
 * Data:   CompanyPerson[] passed from the detail page
 * Notes:  The identity card shows the primary contact (clickable). Rule: with NO people yet the click goes
 *         straight to the add-person wizard (skip the empty list); once there are people it opens the small
 *         list modal (CompanyPeopleSection bare — list + add/remove at the bottom).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Users } from "lucide-react"
import { Modal } from "@/components/ui/actions"
import { CompanyPeopleSection } from "@/components/contacts/CompanyPeopleSection"
import { AddCompanyPersonModal } from "@/components/contacts/AddCompanyPersonModal"
import type { CompanyPerson } from "@/lib/contacts/companyPeople"

export function SupplierPeople({
  people, companyContactId,
}: Readonly<{ people: CompanyPerson[]; companyContactId: string }>) {
  const router = useRouter()
  const [listOpen, setListOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const primary = people.find((p) => p.isPrimary) ?? people[0] ?? null
  const extra = Math.max(0, people.length - 1)
  const hasPeople = people.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => (hasPeople ? setListOpen(true) : setAddOpen(true))}
        className="flex w-full items-center gap-2 text-left text-sm transition-colors hover:text-brand"
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {primary?.name ?? "Add people"}
          {extra > 0 && <span className="text-muted-foreground"> · +{extra} more</span>}
        </span>
      </button>

      <Modal open={listOpen} onClose={() => setListOpen(false)} title="People">
        <CompanyPeopleSection people={people} companyContactId={companyContactId} fica={false} variant="bare" />
      </Modal>

      {/* No people yet → straight to the add wizard (no empty intermediate list). */}
      <AddCompanyPersonModal
        open={addOpen}
        onOpenChange={setAddOpen}
        companyContactId={companyContactId}
        fica={false}
        onCreated={() => router.refresh()}
      />
    </>
  )
}
