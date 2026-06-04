"use client"

/**
 * components/contacts/CompanyPeopleSection.tsx — the "People" section on a company contact's detail page
 *
 * Auth:   rendered inside a gateway-protected detail page; mutations go through agent-write server actions
 * Data:   CompanyPerson[] (fetched by the page) + addCompanyPerson / removeCompanyPerson
 * Notes:  ADDENDUM_25A §6. Lists the people under an organisation contact (function, title, primary /
 *         signatory badges, tap-to-call/email) and lets you remove them inline. Adding a person opens the
 *         shared add-party WizardModal (AddCompanyPersonModal) so it matches the tenant/landlord person
 *         flow exactly — ID optional. Render only for organisations.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Crown, Calculator, Wrench, FileText, User, Phone, Mail } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AddInline, DeleteButton } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"
import { AddCompanyPersonModal } from "@/components/contacts/AddCompanyPersonModal"
import { COMPANY_FUNCTION_LABEL } from "@/lib/contacts/contactScope"
import { removeCompanyPerson } from "@/lib/actions/companyContacts"
import type { CompanyPerson } from "@/lib/contacts/companyPeople"

const FUNCTION_ICON: Record<string, LucideIcon> = {
  owner_director: Crown, account_manager: User, accounts: Calculator, maintenance: Wrench, leasing: FileText, other: User,
}

function Badge({ label, tone }: Readonly<{ label: string; tone: "primary" | "signatory" }>) {
  return (
    <span className={`rounded-[var(--r-button)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone === "primary" ? "bg-primary/15 text-brand" : "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  )
}

function PersonRow({ person, onRemove, busy }: Readonly<{ person: CompanyPerson; onRemove: () => void; busy: boolean }>) {
  const Icon = FUNCTION_ICON[person.companyFunction ?? "other"] ?? User
  const functionLabel = person.companyFunction ? COMPANY_FUNCTION_LABEL[person.companyFunction] ?? "Contact" : null
  const sub = [functionLabel, person.designation].filter(Boolean).join(" · ")
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--r-button)] bg-muted">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
          {person.isPrimary && <Badge label="Primary" tone="primary" />}
          {person.isSignatory && <Badge label="Signatory" tone="signatory" />}
        </div>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {person.phone && (
          <a href={`tel:${person.phone}`} aria-label={`Call ${person.name}`} className="grid h-8 w-8 place-items-center rounded-[var(--r-button)] border border-border text-brand transition-colors hover:bg-muted">
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {person.email && (
          <a href={`mailto:${person.email}`} aria-label={`Email ${person.name}`} className="grid h-8 w-8 place-items-center rounded-[var(--r-button)] border border-border text-muted-foreground transition-colors hover:bg-muted">
            <Mail className="h-3.5 w-3.5" />
          </a>
        )}
        <DeleteButton label={`Remove ${person.name}`} itemName={person.name} description="They'll be removed from this company's contacts. This can't be undone." confirmLabel="Remove" loading={busy} onConfirm={onRemove} />
      </div>
    </div>
  )
}

export function CompanyPeopleSection({
  people, companyContactId, fica, variant = "card",
}: Readonly<{ people: CompanyPerson[]; companyContactId: string; fica: boolean; variant?: "card" | "bare" }>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()

  function remove(personId: string) {
    startTransition(async () => {
      const res = await removeCompanyPerson({ personId })
      if (res.ok) router.refresh()
    })
  }

  const body = (
    <>
      {people.length === 0 && <p className="text-sm text-muted-foreground">No people added yet.</p>}

      {people.length > 0 && (
        <div className="divide-y divide-border/60">
          {people.map((p) => <PersonRow key={p.id} person={p} busy={pending} onRemove={() => remove(p.id)} />)}
        </div>
      )}

      <div className="mt-3">
        <AddInline label="Add a person" onClick={() => setAdding(true)} />
      </div>

      <AddCompanyPersonModal
        open={adding}
        onOpenChange={setAdding}
        companyContactId={companyContactId}
        fica={fica}
        onCreated={() => router.refresh()}
      />
    </>
  )

  if (variant === "bare") return body
  return <DetailCard title="People" count={people.length}>{body}</DetailCard>
}
