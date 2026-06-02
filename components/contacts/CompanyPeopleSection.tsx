"use client"

/**
 * components/contacts/CompanyPeopleSection.tsx — the "People" section on a company contact's detail page
 *
 * Auth:   rendered inside a gateway-protected detail page; mutations go through agent-write server actions
 * Data:   CompanyPerson[] (fetched by the page) + addCompanyPerson / removeCompanyPerson
 * Notes:  ADDENDUM_25A §6. Lists the people under an organisation contact (function, title, primary /
 *         signatory badges, tap-to-call/email) and lets you add or remove them inline. A signatory needs
 *         a FICA ID (only offered on `fica` companies — landlord/tenant). Render only for organisations.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Crown, Calculator, Wrench, FileText, User, Phone, Mail, Plus, Trash2, Loader2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { SectionCard } from "./SectionCard"
import { COMPANY_FUNCTION_LABEL } from "@/lib/contacts/contactScope"
import { COMPANY_FUNCTION_OPTIONS } from "@/lib/parties/partyConfig"
import { validateSAId } from "@/lib/parties/partyValidation"
import { addCompanyPerson, removeCompanyPerson } from "@/lib/actions/companyContacts"
import type { CompanyPerson } from "@/lib/contacts/companyPeople"

const FUNCTION_ICON: Record<string, LucideIcon> = {
  owner_director: Crown, account_manager: User, accounts: Calculator, maintenance: Wrench, leasing: FileText, other: User,
}

const inputCls = "w-full border-0 border-b border-input bg-transparent px-0 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
const labelCls = "block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground mb-1"

interface Draft {
  firstName: string; lastName: string; companyFunction: string; designation: string
  email: string; phone: string; isPrimary: boolean; isSignatory: boolean; idType: string; idNumber: string
}
const EMPTY_DRAFT: Draft = {
  firstName: "", lastName: "", companyFunction: "other", designation: "",
  email: "", phone: "", isPrimary: false, isSignatory: false, idType: "sa_id", idNumber: "",
}

/** Label wrapping its control (associates them — a11y). */
function L({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
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
        <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${person.name}`} className="grid h-8 w-8 place-items-center rounded-[var(--r-button)] border border-border text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function AddPersonForm({
  draft, set, fica, error, pending, onSubmit, onCancel,
}: Readonly<{ draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; fica: boolean; error: string | null; pending: boolean; onSubmit: () => void; onCancel: () => void }>) {
  const isSaId = (draft.idType || "sa_id") === "sa_id"
  const idCheck = draft.isSignatory && isSaId ? validateSAId(draft.idNumber) : null
  return (
    <div className="mt-3 rounded-[var(--r-button)] border border-border bg-muted/20 p-3.5">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <L label="First name"><input className={inputCls} value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jane" /></L>
        <L label="Last name"><input className={inputCls} value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Smith" /></L>
        <L label="Function">
          <select className={`${inputCls} appearance-none`} value={draft.companyFunction} onChange={(e) => set("companyFunction", e.target.value)}>
            {COMPANY_FUNCTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </L>
        <L label="Role / title"><input className={inputCls} value={draft.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Optional" /></L>
        <L label="Email"><input className={inputCls} type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@company.co.za" /></L>
        <L label="Phone"><input className={inputCls} type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="082 000 0000" /></L>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-xs font-medium">
        <input type="checkbox" checked={draft.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} />
        <span>Primary contact</span>
      </label>

      {fica && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
            <input type="checkbox" checked={draft.isSignatory} onChange={(e) => set("isSignatory", e.target.checked)} />
            <span>Signatory — signs for the company (FICA required)</span>
          </label>
          {draft.isSignatory && (
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <L label="ID type">
                <select className={`${inputCls} appearance-none`} value={draft.idType} onChange={(e) => set("idType", e.target.value)}>
                  <option value="sa_id">SA ID Number</option>
                  <option value="passport">Passport</option>
                  <option value="asylum_permit">Permit</option>
                </select>
              </L>
              <L label="ID number">
                <input className={inputCls} value={draft.idNumber} onChange={(e) => set("idNumber", e.target.value)} placeholder={isSaId ? "13-digit SA ID" : "Passport / permit"} />
                {idCheck && (
                  <span className={`mt-1 block text-xs ${idCheck.valid ? "text-emerald-600" : "text-destructive"}`}>
                    {idCheck.valid ? `Valid · ${idCheck.gender} · ${idCheck.citizenship}` : "Checksum doesn't validate"}
                  </span>
                )}
              </L>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onSubmit} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add person
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  )
}

export function CompanyPeopleSection({
  people, companyContactId, fica,
}: Readonly<{ people: CompanyPerson[]; companyContactId: string; fica: boolean }>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await addCompanyPerson({ companyContactId, ...draft })
      if (!res.ok) { setError(res.error ?? "Failed to add the person."); return }
      setDraft(EMPTY_DRAFT)
      setAdding(false)
      router.refresh()
    })
  }

  function remove(personId: string) {
    startTransition(async () => {
      const res = await removeCompanyPerson({ personId })
      if (res.ok) router.refresh()
    })
  }

  return (
    <SectionCard title="People" count={people.length}>
      {people.length === 0 && !adding && <p className="text-sm text-muted-foreground">No people added yet.</p>}

      {people.length > 0 && (
        <div className="divide-y divide-border/60">
          {people.map((p) => <PersonRow key={p.id} person={p} busy={pending} onRemove={() => remove(p.id)} />)}
        </div>
      )}

      {adding ? (
        <AddPersonForm draft={draft} set={set} fica={fica} error={error} pending={pending} onSubmit={submit} onCancel={() => { setAdding(false); setError(null) }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <Plus className="h-4 w-4" /> Add a person
        </button>
      )}
    </SectionCard>
  )
}
