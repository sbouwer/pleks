/**
 * components/contacts/CompanyPeopleSection.tsx — the "People" section on a company contact's detail page
 *
 * Auth:   rendered inside a gateway-protected detail page
 * Data:   CompanyPerson[] (fetched by the page via fetchCompanyPeople)
 * Notes:  ADDENDUM_25A §6. Lists the people under an organisation contact with their function, free-text
 *         title, primary / signatory badges, and tap-to-call / tap-to-email. Only render for organisation
 *         contacts. Presentational (server) — the inline "add/manage" flow lands in a follow-on.
 */
import { Crown, Calculator, Wrench, FileText, User, Phone, Mail } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { SectionCard } from "./SectionCard"
import { COMPANY_FUNCTION_LABEL } from "@/lib/contacts/contactScope"
import type { CompanyPerson } from "@/lib/contacts/companyPeople"

const FUNCTION_ICON: Record<string, LucideIcon> = {
  owner_director: Crown,
  account_manager: User,
  accounts: Calculator,
  maintenance: Wrench,
  leasing: FileText,
  other: User,
}

function Badge({ label, tone }: Readonly<{ label: string; tone: "primary" | "signatory" }>) {
  return (
    <span
      className={`rounded-[var(--r-button)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        tone === "primary" ? "bg-primary/15 text-brand" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  )
}

function PersonRow({ person }: Readonly<{ person: CompanyPerson }>) {
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
      </div>
    </div>
  )
}

export function CompanyPeopleSection({ people }: Readonly<{ people: CompanyPerson[] }>) {
  return (
    <SectionCard title="People" count={people.length}>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">No people added yet.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {people.map((p) => <PersonRow key={p.id} person={p} />)}
        </div>
      )}
    </SectionCard>
  )
}
