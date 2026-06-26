"use client"

/**
 * app/(applicant)/apply/[slug]/applyRoster.tsx — the multi-applicant card roster
 *
 * Notes:  Shown after an applicant's sign-off (verify email + consent) when the application has MORE THAN ONE
 *         applicant (couple · guarantor · company). One card per applicant — completed (green) / outstanding —
 *         and Review&Submit unlocks only when every card is green. Two reusable card types: CompanyCard (the
 *         entity, shown on top as the main applicant) + PersonCard (directors / sureties / co-applicants). The
 *         company card + entitlement nudges land in a later phase; the cards + the all-green gate are here.
 *         Shares only bricks (StepHeading, ActionButton). See project_pleks_apply_multiapplicant_roster.
 */
import { Building2, CheckCircle2, Clock, Users, User } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { StepHeading } from "./applyShared"

export type ApplicantCardStatus = "complete" | "outstanding"

function StatusPill({ status }: Readonly<{ status: ApplicantCardStatus }>) {
  return status === "complete" ? (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
      <CheckCircle2 className="size-3.5" /> Completed
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--amber)] bg-[var(--amber-wash)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--amber-ink)]">
      <Clock className="size-3.5" /> Outstanding
    </span>
  )
}

function cardTone(status: ApplicantCardStatus): string {
  return status === "complete" ? "border-emerald-200 bg-emerald-50" : "border-[var(--rule)] bg-[var(--paper-sunk)]"
}
function iconTone(status: ApplicantCardStatus): string {
  return status === "complete" ? "bg-emerald-100 text-emerald-700" : "border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-mute)]"
}

/** The COMPANY applicant — the main applicant, shown on top. (Wired into the roster in the company phase.) */
export function CompanyCard({ name, status }: Readonly<{ name: string; status: ApplicantCardStatus }>) {
  return (
    <div className={`flex items-center gap-3 rounded-[var(--r-button)] border p-4 ${cardTone(status)}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-[var(--r-button)] ${iconTone(status)}`}>
        <Building2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{name}</p>
        <p className="text-xs text-[var(--ink-mute)]">Company — main applicant</p>
      </div>
      <StatusPill status={status} />
    </div>
  )
}

/** A person applicant — director / surety / co-applicant. */
export function PersonCard({ name, roleLabel, status }: Readonly<{ name: string; roleLabel: string; status: ApplicantCardStatus }>) {
  return (
    <div className={`flex items-center gap-3 rounded-[var(--r-button)] border p-4 ${cardTone(status)}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${iconTone(status)}`}>
        {status === "complete" ? <CheckCircle2 className="size-5" /> : <User className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{name}</p>
        <p className="text-xs text-[var(--ink-mute)]">{roleLabel}</p>
      </div>
      <StatusPill status={status} />
    </div>
  )
}

export interface RosterPerson { name: string; roleLabel: string; status: ApplicantCardStatus }

type RosterFiller = { firstName?: string | null; lastName?: string | null }
type RosterCo = { firstName?: string | null; lastName?: string | null; email?: string | null; designation?: string | null; role?: string | null }

/** ONE builder for the roster's person cards, used at BOTH moments (the company sign-off hub and the final review)
 *  so card assembly — name extraction, ordering, the filler-first rule — lives in a single place and can't drift.
 *  The caller supplies the status source (hub → all "outstanding"; review → per-applicant sign-off readiness) and
 *  the role labels. Indices are filler=0, then co-applicants in order. */
export function buildRosterPersons(
  form: RosterFiller,
  coApplicants: ReadonlyArray<RosterCo>,
  opts: Readonly<{ statusAt: (index: number) => ApplicantCardStatus; fillerRole: string; coRole: (c: RosterCo) => string; includeFiller?: boolean }>,
): RosterPerson[] {
  const name = (f?: string | null, l?: string | null, fallback = "Applicant") => [f, l].filter(Boolean).join(" ") || fallback
  const includeFiller = opts.includeFiller ?? true
  const out: RosterPerson[] = []
  if (includeFiller) out.push({ name: name(form.firstName, form.lastName, "You"), roleLabel: opts.fillerRole, status: opts.statusAt(0) })
  coApplicants.forEach((c, i) => out.push({ name: name(c.firstName, c.lastName, c.email || "Applicant"), roleLabel: opts.coRole(c), status: opts.statusAt(includeFiller ? i + 1 : i) }))
  return out
}

/** The roster screen: the cards + the gate. companyCard is the optional main (company) card on top. Three footers:
 *  all green → onReview (affordability review + submit); a NUDGE (onContinueOwn) → the filler has an outstanding OWN
 *  section to do next (e.g. the director after the company sign-off); otherwise a waiting-on-others state. */
export function ApplicantRoster({ persons, companyCard, allGreen, outstandingCount, onReview, amendSlot, onContinueOwn, continueLabel, waitingNote }: Readonly<{
  persons: RosterPerson[]; companyCard?: React.ReactNode; allGreen: boolean; outstandingCount: number; onReview: () => void
  amendSlot?: React.ReactNode; onContinueOwn?: () => void; continueLabel?: string; waitingNote?: React.ReactNode
}>) {
  const nudge = !allGreen && !!onContinueOwn
  let title = "Your part is done ✓"
  let sub = "Your details, documents and consent are all in. The application goes to the agent once everyone has finished their part."
  if (allGreen) { title = "Everyone's done ✓"; sub = "All applicants have completed their details and consented. Review the application and submit it to the agent." }
  else if (nudge) { title = "Company application complete ✓"; sub = "Now complete your own application — each person on the application has their own card below." }
  return (
    <div className="flex min-h-full flex-col gap-4">
      <StepHeading title={title} sub={sub} />

      {companyCard}
      {/* Full-width stack so every card matches the company card's width (a single person in a 2-col grid read as a
          half-width "funny" card). */}
      <div className="flex flex-col gap-3">
        {persons.map((p) => <PersonCard key={`${p.roleLabel}-${p.name}`} name={p.name} roleLabel={p.roleLabel} status={p.status} />)}
      </div>

      {!allGreen && !nudge && (
        <>
          <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
            <Users className="mt-0.5 size-5 shrink-0 text-[var(--ink-mute)]" />
            <span>{waitingNote ?? <>Waiting on <strong className="text-[var(--ink)]">{outstandingCount}</strong> {outstandingCount === 1 ? "applicant" : "applicants"} to finish. Each has their own secure link, and nothing goes to the agent until everyone&apos;s done — come back via your saved link to submit once they have.</>}</span>
          </div>
          {amendSlot}
        </>
      )}

      {allGreen && (
        <div className="mt-auto flex justify-end pt-3">
          <ActionButton tone="primary" onClick={onReview}>Review application</ActionButton>
        </div>
      )}
      {nudge && onContinueOwn && (
        <div className="mt-auto flex justify-end pt-3">
          <ActionButton tone="primary" onClick={onContinueOwn}>{continueLabel ?? "Continue with your application"}</ActionButton>
        </div>
      )}
    </div>
  )
}
