"use client"

/**
 * app/(applicant)/apply/[slug]/applyStatusMenu.tsx — "Your application status" hub (ADDENDUM_14Q increment 1)
 *
 * Notes:  The persistent home for a MULTI-PARTY application (couple · guarantor · company): one card per applicant —
 *         the company card on top, person cards under — each with a 3-state status (Not started / In progress /
 *         Completed) and EITHER a credential-gated open/edit action (the filler may do their own card + the company
 *         card) OR a status-only note ("invited — completes via their own link"). Review & Submit is an
 *         application-level primary here, enabled only when every card is Completed; when gated it NAMES who's
 *         outstanding (CD §8.5) since a filler can be blocked by a co-applicant they cannot complete for.
 *           This is the presentational hub only — the view-state wiring (ApplyView) + the per-card status/credential
 *         source come in increment 2. It reuses the roster's door-card grammar; the transient ApplicantRoster is
 *         retired once this is the hub (increment 6). The all-green gate is an affordance — submit re-validates
 *         server-side (CD cross-cutting B).
 */
import { Building2, CheckCircle2, Clock, Circle, ChevronRight, User, Lock, Send } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { StepHeading } from "./applyShared"

export type CardStatus = "not_started" | "in_progress" | "completed"

/** A person applicant card on the hub (director / surety / co-applicant). `id` is the open-target the hub dispatches
 *  ("self" for the filler's own card, "co_{id}" for a co-applicant). canOpen = the filler holds credentials to it. */
export interface StatusMenuPerson { id: string; name: string; roleLabel: string; status: CardStatus; canOpen: boolean; statusOnlyNote?: string }
/** The company applicant card (the main applicant). canOpen = the filler is an entitled director/owner. */
export interface StatusMenuCompany { name: string; status: CardStatus; canOpen: boolean }

const STATUS_LABEL: Record<CardStatus, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" }
/** The action verb for an openable card, by status — the hub is where you ACT (CD §8.1). */
const OPEN_LABEL: Record<CardStatus, string> = { not_started: "Start", in_progress: "Continue", completed: "Review" }

function StatusPill({ status }: Readonly<{ status: CardStatus }>) {
  if (status === "completed") return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" /> {STATUS_LABEL.completed}</span>
  )
  if (status === "in_progress") return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--amber)] bg-[var(--amber-wash)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--amber-ink)]"><Clock className="size-3.5" /> {STATUS_LABEL.in_progress}</span>
  )
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ink-mute)]"><Circle className="size-3.5" /> {STATUS_LABEL.not_started}</span>
  )
}
function cardTone(status: CardStatus): string {
  return status === "completed" ? "border-emerald-200 bg-emerald-50" : "border-[var(--rule)] bg-[var(--paper-sunk)]"
}
function iconTone(status: CardStatus): string {
  return status === "completed" ? "bg-emerald-100 text-emerald-700" : "border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-mute)]"
}

/** One hub card. Openable → a clickable button (whole card) with the status-appropriate verb + chevron; otherwise a
 *  static card with a lock + the status-only note. `square` gives the company card a square icon (vs round persons). */
function MenuCard({ icon, name, sub, status, canOpen, statusOnlyNote, onOpen, square }: Readonly<{
  icon: React.ReactNode; name: string; sub: string; status: CardStatus; canOpen: boolean; statusOnlyNote?: string
  onOpen?: () => void; square?: boolean
}>) {
  const iconRadius = square ? "rounded-[var(--r-button)] size-10" : "rounded-full size-9"
  const body = (
    <>
      <span className={`flex shrink-0 items-center justify-center ${iconRadius} ${iconTone(status)}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{name}</p>
        <p className="text-xs text-[var(--ink-mute)]">{canOpen ? sub : (statusOnlyNote ?? sub)}</p>
      </div>
      <StatusPill status={status} />
    </>
  )
  if (canOpen && onOpen) return (
    <button type="button" onClick={onOpen} aria-label={`${OPEN_LABEL[status]} — ${name}`}
      className={`group flex w-full items-center gap-3 rounded-[var(--r-button)] border p-4 text-left transition-colors hover:border-[var(--amber)] ${cardTone(status)}`}>
      {body}
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--ink-soft)] group-hover:text-[var(--amber-ink)]">{OPEN_LABEL[status]} <ChevronRight className="size-4" /></span>
    </button>
  )
  return (
    <div className={`flex items-center gap-3 rounded-[var(--r-button)] border p-4 ${cardTone(status)}`}>
      {body}
      <Lock className="size-4 shrink-0 text-[var(--ink-mute)]" aria-label="Completed via their own link" />
    </div>
  )
}

/** The hub's submit affordance. The filler can only complete THEIR OWN (openable) cards, so Review & Submit unlocks
 *  on those (`fillerReady`); status-only parties (co-applicants/directors) complete via their own links and are the
 *  server's everyone-gate at submit-to-agent (CD cross-cutting B), surfaced here only as `others` for transparency.
 *  Pure so it's unit-testable. */
export function summariseStatus(company: StatusMenuCompany | null | undefined, persons: ReadonlyArray<StatusMenuPerson>): {
  fillerReady: boolean; mine: string[]; others: string[]
} {
  const mine: string[] = []   // the filler's own openable cards not yet completed
  const others: string[] = [] // status-only cards (each completes via their own link)
  if (company) { if (company.canOpen) { if (company.status !== "completed") mine.push(company.name) } else others.push(company.name) }
  for (const p of persons) {
    if (p.canOpen) { if (p.status !== "completed") mine.push(p.name) }
    else others.push(p.name)
  }
  return { fillerReady: mine.length === 0, mine, others }
}

export function ApplicationStatusMenu({ unitTitle, company, persons, onOpen, onSubmit, busy, canSubmit = true }: Readonly<{
  unitTitle: string
  company?: StatusMenuCompany | null
  persons: StatusMenuPerson[]
  onOpen: (id: string) => void   // "company" | "self" | "co_{id}"
  onSubmit: () => void
  busy?: boolean
  /** the current filler may press Submit (the primary/signatory owns it — CD cross-cutting A). */
  canSubmit?: boolean
}>) {
  const { fillerReady, mine, others } = summariseStatus(company, persons)
  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Header — "status" must not read as view-only; the subhead makes "tap your card to complete" obvious (CD §8.1). */}
      <StepHeading title={`Your application status — ${unitTitle}`} sub="Tap a card to complete that applicant's part. The application goes to the agent once everyone is done." />

      {company && (
        <MenuCard square icon={<Building2 className="size-5" />} name={company.name} sub="Company — main applicant"
          status={company.status} canOpen={company.canOpen} statusOnlyNote="The company section is completed by an entitled director."
          onOpen={() => onOpen("company")} />
      )}

      <div className="flex flex-col gap-3">
        {persons.map((p) => (
          <MenuCard key={p.id} icon={p.status === "completed" ? <CheckCircle2 className="size-5" /> : <User className="size-5" />}
            name={p.name} sub={p.roleLabel} status={p.status} canOpen={p.canOpen}
            statusOnlyNote={p.statusOnlyNote ?? `${p.roleLabel} — invited, completes via their own link`}
            onOpen={() => onOpen(p.id)} />
        ))}
      </div>

      {/* Review & Submit — application-level primary (not an applicant card). It unlocks once the FILLER's own cards
          are done (`fillerReady`); status-only parties complete via their own links and are the server's everyone-gate
          at submit-to-agent (CD cross-cutting B), surfaced here only as a note. If the filler still has their own
          section to finish, that's what's named (CD §8.5). */}
      <div className="mt-auto flex flex-col gap-3 pt-3">
        {!fillerReady && (
          <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
            <Clock className="mt-0.5 size-5 shrink-0 text-[var(--ink-mute)]" />
            <span>Finish <strong className="text-[var(--ink)]">{mine.join(", ")}</strong> to continue.</span>
          </div>
        )}
        {fillerReady && others.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
            <Clock className="mt-0.5 size-5 shrink-0 text-[var(--ink-mute)]" />
            <span><strong className="text-[var(--ink)]">{others.join(", ")}</strong> {others.length === 1 ? "completes" : "complete"} via their own link — the application only goes to the agent once everyone&apos;s done.</span>
          </div>
        )}
        {canSubmit && (
          <div className="flex justify-end">
            <ActionButton tone="primary" icon={<Send className="size-4" />} onClick={onSubmit} disabled={!fillerReady || busy}>
              Review &amp; submit
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  )
}
