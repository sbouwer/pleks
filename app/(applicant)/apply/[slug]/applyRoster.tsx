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

/** The roster screen: the cards + the all-green gate. companyCard is the optional main (company) card on top.
 *  When everyone's green, onReview reveals the affordability review + submit; otherwise it's a waiting state. */
export function ApplicantRoster({ persons, companyCard, allGreen, outstandingCount, onReview, amendSlot }: Readonly<{
  persons: RosterPerson[]; companyCard?: React.ReactNode; allGreen: boolean; outstandingCount: number; onReview: () => void; amendSlot?: React.ReactNode
}>) {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <StepHeading
        title={allGreen ? "Everyone's done ✓" : "Your part is done ✓"}
        sub={allGreen
          ? "All applicants have completed their details and consented. Review the application and submit it to the agent."
          : "Your details, documents and consent are all in. The application goes to the agent once everyone has finished their part."} />

      {companyCard}
      <div className="grid gap-3 sm:grid-cols-2">
        {persons.map((p) => <PersonCard key={`${p.roleLabel}-${p.name}`} name={p.name} roleLabel={p.roleLabel} status={p.status} />)}
      </div>

      {!allGreen && (
        <>
          <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
            <Users className="mt-0.5 size-5 shrink-0 text-[var(--ink-mute)]" />
            <span>Waiting on <strong className="text-[var(--ink)]">{outstandingCount}</strong> {outstandingCount === 1 ? "applicant" : "applicants"} to finish. Each has their own secure link, and nothing goes to the agent until everyone&apos;s done — come back via your saved link to submit once they have.</span>
          </div>
          {amendSlot}
        </>
      )}

      {allGreen && (
        <div className="mt-auto flex justify-end pt-3">
          <ActionButton tone="primary" onClick={onReview}>Review application</ActionButton>
        </div>
      )}
    </div>
  )
}
