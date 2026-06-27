"use client"

/**
 * app/(applicant)/apply/[slug]/applyStatusMenu.tsx — "Your application status" hub (ADDENDUM_14Q)
 *
 * Notes:  The persistent home for EVERY application: one card per applicant — the company card on top, person cards
 *         under — each with a status (Invitation sent / Not started / Started application / Completed / Updated
 *         application) and EITHER a credential-gated open/edit action (the filler may do their own card + the company
 *         card) OR a status-only note ("invited — completes via their own link"). Review & Submit is an
 *         application-level primary, enabled once the FILLER's own cards are done; when gated it NAMES who's
 *         outstanding (CD §8.5). The status pill sits in a FIXED-WIDTH column so the pills line up across stacked
 *         cards regardless of name length or open/locked affordance. The all-green gate is an affordance — submit
 *         re-validates server-side (CD cross-cutting B).
 */
import { Building2, CheckCircle2, Clock, Circle, ChevronRight, User, Lock, Send, RefreshCw } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"

export type CardStatus = "not_started" | "invitation_sent" | "in_progress" | "completed" | "updated"

/** A person applicant card on the hub (director / surety / co-applicant). `id` is the open-target the hub dispatches
 *  ("self" for the filler's own card, "co_{id}" for a co-applicant). canOpen = the filler holds credentials to it. */
export interface StatusMenuPerson { id: string; name: string; roleLabel: string; status: CardStatus; canOpen: boolean; statusOnlyNote?: string }
/** The company applicant card (the main applicant). canOpen = the filler is an entitled director/owner. */
export interface StatusMenuCompany { name: string; status: CardStatus; canOpen: boolean }

/** A card counts as "done for submit" once completed — OR updated (edited after completion; still ready to submit). */
const DONE_STATES = new Set<CardStatus>(["completed", "updated"])

const STATUS_LABEL: Record<CardStatus, string> = {
  not_started: "Not started",
  invitation_sent: "Invitation sent",
  in_progress: "Started application",
  completed: "Completed",
  updated: "Updated application",
}
/** The action verb for an openable card, by status — the hub is where you ACT (CD §8.1). */
const OPEN_LABEL: Record<CardStatus, string> = {
  not_started: "Start", invitation_sent: "Start", in_progress: "Continue", completed: "Review", updated: "Review",
}

function StatusPill({ status }: Readonly<{ status: CardStatus }>) {
  const base = "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
  if (status === "completed") return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}><CheckCircle2 className="size-3.5" /> {STATUS_LABEL.completed}</span>
  if (status === "updated") return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700`}><RefreshCw className="size-3.5" /> {STATUS_LABEL.updated}</span>
  if (status === "in_progress") return <span className={`${base} border-[var(--amber)] bg-[var(--amber-wash)] text-[var(--amber-ink)]`}><Clock className="size-3.5" /> {STATUS_LABEL.in_progress}</span>
  if (status === "invitation_sent") return <span className={`${base} border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-mute)]`}><Send className="size-3.5" /> {STATUS_LABEL.invitation_sent}</span>
  return <span className={`${base} border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-mute)]`}><Circle className="size-3.5" /> {STATUS_LABEL.not_started}</span>
}
function cardTone(status: CardStatus): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50"
  if (status === "updated") return "border-blue-200 bg-blue-50"
  return "border-[var(--rule)] bg-[var(--paper-sunk)]"
}
function iconTone(status: CardStatus): string {
  if (status === "completed") return "bg-emerald-100 text-emerald-700"
  if (status === "updated") return "bg-blue-100 text-blue-700"
  return "border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-mute)]"
}

/** One hub card. Layout is a fixed column grid — [icon] [name/sub (flex)] [pill (fixed)] [affordance (fixed)] — so
 *  the status pills align vertically down a stack of cards no matter the name length or open/locked trailing action.
 *  Openable → the whole card is a button (status verb + chevron); otherwise a static card with a lock. */
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
        <p className="truncate text-xs text-[var(--ink-mute)]">{canOpen ? sub : (statusOnlyNote ?? sub)}</p>
      </div>
      {/* Fixed-width pill column → pills line up across stacked cards. */}
      <div className="flex w-[150px] shrink-0 justify-end"><StatusPill status={status} /></div>
    </>
  )
  if (canOpen && onOpen) return (
    <button type="button" onClick={onOpen} aria-label={`${OPEN_LABEL[status]} — ${name}`}
      className={`group flex w-full items-center gap-3 rounded-[var(--r-button)] border p-4 text-left transition-colors hover:border-[var(--amber)] ${cardTone(status)}`}>
      {body}
      <span className="flex w-[84px] shrink-0 items-center justify-end gap-1 text-xs font-semibold text-[var(--ink-soft)] group-hover:text-[var(--amber-ink)]">{OPEN_LABEL[status]} <ChevronRight className="size-4" /></span>
    </button>
  )
  return (
    <div className={`flex items-center gap-3 rounded-[var(--r-button)] border p-4 ${cardTone(status)}`}>
      {body}
      <span className="flex w-[84px] shrink-0 items-center justify-end"><Lock className="size-4 text-[var(--ink-mute)]" aria-label="Completed via their own link" /></span>
    </div>
  )
}

/** The hub's submit affordance. The filler can only complete THEIR OWN (openable) cards, so Review & Submit unlocks
 *  on those (`fillerReady`); status-only parties (co-applicants/directors) complete via their own links and are the
 *  server's everyone-gate at submit-to-agent (CD cross-cutting B), surfaced here only as `others` for transparency.
 *  A card is "ready" once completed OR updated (edited after completion). Pure so it's unit-testable. */
export function summariseStatus(company: StatusMenuCompany | null | undefined, persons: ReadonlyArray<StatusMenuPerson>): {
  fillerReady: boolean; mine: string[]; others: string[]
} {
  const mine: string[] = []   // the filler's own openable cards not yet done
  const others: string[] = [] // status-only cards (each completes via their own link)
  if (company) { if (company.canOpen) { if (!DONE_STATES.has(company.status)) mine.push(company.name) } else others.push(company.name) }
  for (const p of persons) {
    if (p.canOpen) { if (!DONE_STATES.has(p.status)) mine.push(p.name) }
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
      {/* The panel header carries the title (amber tick) — here we just orient the applicant on what to do. */}
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">Tap a card to complete that applicant&apos;s part for <span className="font-medium text-[var(--ink)]">{unitTitle}</span>. The application goes to the agent once everyone is done.</p>

      {company && (
        <MenuCard square icon={<Building2 className="size-5" />} name={company.name} sub="Company — main applicant"
          status={company.status} canOpen={company.canOpen} statusOnlyNote="The company section is completed by an entitled director."
          onOpen={() => onOpen("company")} />
      )}

      <div className="flex flex-col gap-3">
        {persons.map((p) => (
          <MenuCard key={p.id} square icon={DONE_STATES.has(p.status) ? <CheckCircle2 className="size-5" /> : <User className="size-5" />}
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
