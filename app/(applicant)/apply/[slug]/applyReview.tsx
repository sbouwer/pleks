"use client"

/**
 * app/(applicant)/apply/[slug]/applyReview.tsx — the shared Review / submit step
 *
 * Notes:  The application-review + submit surface (declared Step-1 free assessment, email verify, submit-to-agent).
 *         Shared bookend for BOTH flows — the orchestrator (StepPanel) renders it last, after the chosen flow.
 *         Owns its own helpers; shares only bricks + applyDomain.
 */
import { useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Building2, CheckCircle2, Pencil, ShieldCheck, Upload, User, Users } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"
import { formatZAR, startedWithinProbation } from "@/lib/constants"
import type { PartyFormState } from "@/lib/parties/partyValidation"
import { StepHeading } from "./applyShared"
import { ApplicantRoster, CompanyCard, buildRosterPersons, type RosterPerson } from "./applyRoster"
import { type Emp, type IncomeRow, type CoApplicant, type ScreeningStatus, STEP_DOCUMENTS, employmentLabel, rowMonthlyCents, moneyCents, totalMonthlyCents } from "./applyDomain"


// ── Step 6 — Submit → instant Step-1 FREE assessment (declared affordability + readiness; zero-AI) ───────────
// The deep-scan ruling UI (ProcessingView/RulingView/poll) was removed here: the applicant no longer triggers an
// AI deep scan at submit. That runs later, on the agent's shortlist (Step 2). (ADDENDUM_14M three-step funnel)

function AmendBar({ onAmend, onRerun }: Readonly<{ onAmend: (s: number) => void; onRerun: () => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton tone="secondary" size="sm" icon={<Upload className="size-4" />} onClick={() => onAmend(STEP_DOCUMENTS)}>Upload documents</ActionButton>
      <ActionButton tone="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onAmend(0)}>Edit details</ActionButton>
      <ActionButton tone="primary" size="sm" onClick={onRerun}>Re-check now</ActionButton>
    </div>
  )
}

/** Review roster cards — the shared builder (#3) with the review's status source: an applicant's card is "complete"
 *  once they've SIGNED OFF (consent given, per the stored PII-safe readiness), matching the all-green submit gate —
 *  NOT full readiness (optional docs still to add surface behind Review, not as an outstanding card). */
function reviewRosterPersons(form: PartyFormState, coApplicants: CoApplicant[], assessment: FreeAssessmentResult): RosterPerson[] {
  return buildRosterPersons(form, coApplicants, {
    statusAt: (i) => assessment.readiness.items[i]?.missing.includes("consent") ? "outstanding" : "complete",
    fillerRole: "Primary applicant",
    coRole: (c) => (c.role === "guarantor" ? "Guarantor" : "Co-applicant"),
  })
}

/** Final state — nothing more for the applicant to do; the agent has it. Reached by "Submit to agent". */
function HandoffView() {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Submitted to your agent ✓" sub="Your application is now with your agent." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-5">
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          Thanks — your application and documents are now with your agent. They&apos;ll verify everything and update you directly on the outcome. There&apos;s nothing more you need to do for now.
        </p>
      </div>
      <p className="text-xs text-[var(--ink-mute)]">We&apos;ve emailed your confirmation.</p>
    </div>
  )
}

// The doc that corroborates each income source (drives the completeness column's "provided / add it" status).
const AFFORD_BADGE: Record<string, { label: string; cls: string }> = {
  within: { label: "Comfortable", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  marginal: { label: "Tight", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  below: { label: "Short", cls: "border-red-200 bg-red-50 text-red-700" },
  "no-income": { label: "No income", cls: "border-red-200 bg-red-50 text-red-700" },
}
const CITIZEN_LABEL: Record<string, string> = { citizen: "SA citizen", permanent_resident: "Permanent resident", foreign: "Foreign national", unknown: "" }
const MARGIN_ADJ: Record<string, string> = { within: "a comfortable margin", marginal: "a tight margin", below: "a thin margin", "no-income": "" }
function tenureLabel(months: number | null): string | null {
  if (months == null || months <= 0) return null
  const y = Math.floor(months / 12)
  if (y >= 1) return y === 1 ? "1 year" : `${y} years`
  return months === 1 ? "1 month" : `${months} months`
}
// Income-proof doc keys — a missing one is covered by the bank statements (we read income from there).
const INCOME_PROOF = new Set(["payslips", "business_tax", "pension_advice", "grant_proof"])
function docNote(present: boolean, key: string): string {
  if (present) return ""
  return INCOME_PROOF.has(key) ? "— we'll read income from your statements" : "— still to add"
}
/** The written one-line read for the review — composed from the deterministic facts (declared figures + ID decode
 *  + arithmetic). Scoped to the APPLICATION ("complete on what you provided"), never the outcome. */
function reviewSummary(a: FreeAssessmentResult): string {
  const residual = a.randLeftAfterObligationsCents ?? a.randLeftAfterRentCents
  const tenure = tenureLabel(a.employment.tenureMonths)
  const docsAllIn = a.allRequiredDocsPresent
  const verdictGood = a.affordabilityTier === "within" && a.readiness.band === "ready"
  const affClause = a.declaredRatioPct != null && residual != null
    ? `rent is ${a.declaredRatioPct}% of your declared income, leaving ${formatZAR(residual)}/mo after rent and commitments — ${MARGIN_ADJ[a.affordabilityTier] || "as declared"}`
    : "income still to confirm affordability"
  const stabClause = ["identity verified", tenure ? `${tenure} in your current job` : null, docsAllIn ? "documents in" : "documents still to complete"].filter(Boolean).join(", ")
  let closing = "Add the rest to strengthen it."
  if (verdictGood) closing = "A strong, complete application."
  else if (docsAllIn) closing = "A complete application."
  return `On what you've provided: ${affClause}. ${stabClause.charAt(0).toUpperCase()}${stabClause.slice(1)}. ${closing}`
}

/** Step-1 FREE assessment — the application review: Completeness (what's done / still to add) + Residual
 *  affordability (income vs commitments + the residual + a tier read; prompts "Add applicant" when short).
 *  Re-runnable for free; the J1 gate (all co-applicants complete) blocks submit. (ADDENDUM_14M funnel) */
function FreeAssessmentView({ assessment, askingRentCents, emp, rosterPersons, companyName, onAmend, onRerun, onSubmitToAgent, onAddApplicant }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number; emp: Emp; rosterPersons: RosterPerson[]; companyName?: string; onAmend: (s: number) => void; onRerun: () => void; onSubmitToAgent: () => Promise<boolean>; onAddApplicant: () => void }>) {
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  async function doSubmit() {
    setSubmitting(true)
    const ok = await onSubmitToAgent()
    if (ok) setDone(true)
    else setSubmitting(false)
  }
  if (done) return <HandoffView />

  const { incompleteCount } = assessment.readiness
  const readyToSubmit = incompleteCount === 0   // J1: someone unfinished → blocked (server enforces too)
  // A company always has ≥2 applicants (the entity + its director[s]), so it shows the roster even with one director.
  const isMultiParty = rosterPersons.length > 1 || !!companyName

  // Multi-applicant → the card roster: each party's status, and Review unlocks only when all are green. The
  // affordability review + submit lives behind the Review button. A single applicant skips straight to it.
  if (isMultiParty && !reviewing) {
    return (
      <ApplicantRoster
        persons={rosterPersons} allGreen={readyToSubmit} outstandingCount={incompleteCount} onReview={() => setReviewing(true)}
        companyCard={companyName ? <CompanyCard name={companyName} status="complete" /> : undefined}
        amendSlot={
          <div className="flex flex-col gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-3">
            <p className="text-xs text-[var(--ink-mute)]">Want to change something on your side while you wait? It&apos;s free to re-check.</p>
            <AmendBar onAmend={onAmend} onRerun={onRerun} />
          </div>
        }
      />
    )
  }

  // Ready — a structured four-dimension read (Affordability · Identity & stability · Declared income · Documents)
  // topped by a written one-line summary. All declared/unverified, zero-AI. The verdict is scoped to the
  // APPLICATION ("complete and affordable on the figures you provided"), never the outcome — the agent decides.
  const incomeCents = assessment.combinedIncomeCents
  const oblCents = assessment.declaredObligationsCents
  const residualCents = assessment.randLeftAfterObligationsCents ?? assessment.randLeftAfterRentCents ?? (incomeCents - askingRentCents - oblCents)
  const ratioPct = assessment.declaredRatioPct
  const multiple = assessment.incomeMultiple
  const badge = AFFORD_BADGE[assessment.affordabilityTier] ?? AFFORD_BADGE["no-income"]
  const short = assessment.affordabilityTier !== "within" // marginal / below / no-income → prompt "Add applicant"
  const pct = (n: number) => (incomeCents > 0 ? Math.max(0, Math.min(100, Math.round((n / incomeCents) * 100))) : 0)
  const identityOk = !assessment.identity.underageCannotSign && assessment.identity.dobMatchesDeclared !== false
  const tenure = tenureLabel(assessment.employment.tenureMonths)
  const empLabel = emp.employment_type ? employmentLabel(emp.employment_type) : null
  const verdictGood = !short && assessment.readiness.band === "ready"
  const idLine = [assessment.identity.residency === "foreign" ? "Passport" : "SA ID verified", assessment.identity.ageYears ? `age ${assessment.identity.ageYears}` : null, CITIZEN_LABEL[assessment.identity.residency]].filter(Boolean).join(" · ")
  const summary = reviewSummary(assessment)
  return (
    <div className="flex min-h-full flex-col gap-5">
      {/* ONE verdict block, single colour per the score — the headline verdict, a hairline divider, then the written
          one-line read. Scoped to the APPLICATION, never the outcome. (Merged to save vertical space.) */}
      <div className={`rounded-[var(--r-button)] border text-sm leading-relaxed ${verdictGood ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--amber)] bg-[var(--amber-wash)] text-[var(--amber-ink)]"}`}>
        <p className="flex items-start gap-2.5 px-4 pb-3 pt-4">
          {verdictGood ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertCircle className="mt-0.5 size-5 shrink-0" />}
          <span><strong>{verdictGood ? "Looks good." : "Almost there."}</strong> {verdictGood ? "Your application is complete and affordable on the figures you provided." : "Complete the flagged items below, or submit and add them when the agent requests."}</span>
        </p>
        <p className={`border-t px-4 pb-4 pt-3 ${verdictGood ? "border-emerald-200" : "border-[var(--amber)]"}`}>{summary}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Affordability — line-item bullets match the bar-chart colours (rent · commitments · left for rent). */}
        <div className="flex flex-col gap-4 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-5">
          <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]">
            <span className="shrink-0">Affordability</span>
            <span aria-hidden className="h-px flex-1 bg-[var(--rule)]" />
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${badge.cls}`}>{badge.label}</span>
          </h3>
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-soft)]">Declared income</dt><dd className="font-medium text-[var(--ink)]">{formatZAR(incomeCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span className="size-2 shrink-0 rounded-full bg-amber-400" /> Commitments</dt><dd className="text-[var(--ink-soft)]">− {formatZAR(oblCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span className="size-2 shrink-0 rounded-full bg-slate-400" /> This rent</dt><dd className="text-[var(--ink-soft)]">− {formatZAR(askingRentCents)}</dd></div>
          </dl>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--paper-sunk)]" aria-hidden>
            <div className="bg-slate-400" style={{ width: `${pct(askingRentCents)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(oblCents)}%` }} />
            <div className="bg-emerald-500" style={{ width: `${pct(Math.max(0, residualCents))}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]"><span className="size-2 shrink-0 rounded-full bg-emerald-500" /> Left for other expenses</span>
            <span className={`text-xl font-semibold ${residualCents >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatZAR(residualCents)}</span>
          </div>
          <p className="text-[11px] text-[var(--ink-mute)]">{ratioPct != null ? `Rent is ${ratioPct}% of income` : "Income still to confirm"}{multiple != null ? ` · income covers rent ${multiple}×` : ""}</p>
          {short && (
            <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">{assessment.affordabilityTier === "no-income" ? "No income declared yet." : "Rent is high relative to your declared income."} Adding a co-applicant or guarantor whose income counts would strengthen affordability.</p>
              <ActionButton tone="secondary" size="sm" icon={<Users className="size-4" />} className="mt-2" onClick={onAddApplicant}>Add applicant</ActionButton>
            </div>
          )}
        </div>

        {/* Identity & documents — the rest of the declared picture (income lives in the Affordability card). */}
        <div className="flex flex-col gap-4 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-5">
          <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span className="shrink-0">Identity &amp; documents</span><span aria-hidden className="h-px flex-1 bg-[var(--rule)]" /></h3>
          <ul className="flex flex-col gap-2.5 text-sm text-[var(--ink)]">
            <li className="flex items-center gap-2">{identityOk ? <ShieldCheck className="size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="size-4 shrink-0 text-amber-500" />} {idLine}</li>
            {empLabel && <li className="flex items-center gap-2"><User className="size-4 shrink-0 text-[var(--ink-mute)]" /> {empLabel}{tenure ? ` · ${tenure}` : ""}</li>}
            {emp.employer && <li className="flex items-center gap-2"><Building2 className="size-4 shrink-0 text-[var(--ink-mute)]" /> {emp.employer}</li>}
          </ul>
          {assessment.employment.recentlyStarted && <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">Recently started — possibly still in probation. The agent sees this as context.</p>}
          {assessment.employment.contractEndsBeforeLease && <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">Stated contract ends before the lease term — worth a note on whether it&apos;s expected to renew.</p>}

          <div className="border-t border-[var(--rule)] pt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Documents</p>
            <ul className="flex flex-col gap-2 text-sm text-[var(--ink)]">
              {assessment.documents.map((d) => {
                const note = docNote(d.present, d.key)
                return (
                  <li key={d.key} className="flex items-start gap-2">
                    {d.present ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                    <span>{d.label}{note && <span className="text-[var(--ink-mute)]"> {note}</span>}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* What happens next — sets the journey, reinforces pre-selection + the consent/credit-check expectation. */}
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span className="shrink-0">What happens next</span><span aria-hidden className="h-px flex-1 bg-[var(--rule)]" /></h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">You submit → if the agent shortlists you, your documents are verified against what you declared → an optional credit check runs only with your explicit consent, and you&apos;ll receive a copy.</p>
      </div>

      {/* Submit pinned to the BOTTOM of the card (mt-auto), bottom-right. No "amend" button — Back + the side nav
          handle edits. Consent + email verification happened at the review landing, so this just sends. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" icon={<CheckCircle2 className="size-4" />} disabled={submitting} onClick={doSubmit}>{submitting ? "Submitting…" : "Submit application"}</ActionButton>
      </div>
    </div>
  )
}

/** Anti-bot email verification — send a 6-digit code to the applicant's email, then confirm it before submit.
 *  Exported so the company sign-off (StepCompanyReview) reuses the same verify widget. */
export function VerifyEmail({ applicationId, token, email, verified, onVerified, reverify }: Readonly<{
  applicationId: string | null; token: string | null; email?: string; verified: boolean; onVerified: () => void; reverify?: boolean
}>) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!applicationId || !token) { toast.error("Please complete the earlier steps first."); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/verify/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reverify }),
      })
      const json = await res.json() as { ok?: boolean; alreadyVerified?: boolean; error?: string }
      if (json.alreadyVerified) { onVerified(); return }
      if (!res.ok) { toast.error(json.error ?? "Could not send the code."); return }
      setSent(true); toast.success(`Code sent to ${email}`)
    } catch { toast.error("Could not send the code.") } finally { setBusy(false) }
  }
  async function check() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/verify/check`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code }),
      })
      const json = await res.json() as { ok?: boolean; status?: string; error?: string }
      if (json.ok && json.status === "verified") { onVerified(); toast.success("Email verified ✓") }
      else if (json.status === "locked") toast.error(json.error ?? "Too many attempts — try again later.")
      else if (json.status === "expired") { toast.error("That code expired — send a new one."); setSent(false); setCode("") }
      else toast.error("Incorrect code — check and try again.")
    } catch { toast.error("Could not verify the code.") } finally { setBusy(false) }
  }

  if (verified) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--r-button)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> Email verified
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">Verify your email</p>
        <p className="mt-0.5 text-xs text-[var(--ink-soft)]">We&apos;ll send a 6-digit code to <strong className="text-[var(--ink)]">{email ?? "your email"}</strong> to confirm it&apos;s really you.</p>
      </div>
      {!sent ? (
        <ActionButton tone="primary" size="sm" onClick={send} disabled={busy} className="shrink-0">Send code</ActionButton>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" className="w-28 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm tracking-[0.3em]" />
          <ActionButton tone="primary" size="sm" onClick={check} disabled={busy || code.length !== 6}>Verify</ActionButton>
          <button type="button" onClick={send} disabled={busy} className="text-xs text-[var(--ink-mute)] hover:text-[var(--ink)]">Resend</button>
        </div>
      )}
    </div>
  )
}

export function StepSubmit({ form, emp, income, askingRentCents, consent, setConsent, coApplicants, applicantsGreen, screeningStatus, assessment, companyName, onAmend, onRerun, onContinue, onAddApplicant, applicationId, token, emailVerified, onVerified }: Readonly<{
  form: PartyFormState; emp: Emp; income: IncomeRow[]; askingRentCents: number; consent: boolean; setConsent: (v: boolean) => void
  coApplicants: CoApplicant[]; applicantsGreen: boolean; screeningStatus: ScreeningStatus; assessment: FreeAssessmentResult | null; companyName?: string
  onAmend: (s: number) => void; onRerun: () => void; onContinue: () => void; onAddApplicant: () => void
  applicationId: string | null; token: string | null; emailVerified: boolean; onVerified: () => void
}>) {
  // The REAL submission — only when the applicant reviews the pre-screen and chooses to send it to the agent.
  async function submitToAgent(): Promise<boolean> {
    if (!applicationId || !token) return true
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit-to-agent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast.error(b.error ?? "Could not submit. Please try again."); return false }
      return true
    } catch { toast.error("Could not submit. Please try again."); return false }
  }

  if (screeningStatus === "done" && assessment) return <FreeAssessmentView assessment={assessment} askingRentCents={askingRentCents} emp={emp} rosterPersons={reviewRosterPersons(form, coApplicants, assessment)} companyName={companyName} onAmend={onAmend} onRerun={onRerun} onSubmitToAgent={submitToAgent} onAddApplicant={onAddApplicant} />

  const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || "—"
  const incomeCents = totalMonthlyCents(income)
  const namedSources = income.filter((r) => moneyCents(r.amount) > 0)
  const ratio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
  const probation = startedWithinProbation(emp.start_date)
  const others = coApplicants.filter((c) => c.email.trim())
  return (
    <div className="flex min-h-full flex-col gap-4">
      <StepHeading title="Application review" sub="Confirm your email and give consent to continue — then you'll see your review and can submit. Everyone on the application consents and verifies on their own link." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm">
        <Row k="Applicant" v={name} />
        <Row k="Email" v={form.email ?? "—"} />
        <Row k="Employment" v={emp.employment_type ? employmentLabel(emp.employment_type) : "—"} />
        {emp.start_date && <Row k="Employed since" v={probation ? `${emp.start_date} · possible probation` : emp.start_date} />}
        <Row k="Total income" v={incomeCents > 0 ? formatZAR(incomeCents) + " /mo" : "—"} />
        {namedSources.map((r) => <Row key={r.key} k={`— ${r.label || "Other"}`} v={`${formatZAR(rowMonthlyCents(r))} /mo`} />)}
        <Row k="Rent-to-income" v={ratio != null ? `${ratio}%` : "—"} />
        {others.length > 0 && <Row k="Others" v={others.map((c) => c.role === "guarantor" ? "guarantor" : "co-applicant").join(", ")} />}
      </div>
      <VerifyEmail applicationId={applicationId} token={token} email={form.email} verified={emailVerified} onVerified={onVerified} />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--amber)]" />
        <span className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
          <ShieldCheck className="mr-1 inline size-3.5 text-[var(--ink-mute)]" />
          I consent to Pleks processing the information and documents I&apos;ve provided — including automated (AI) analysis of my uploaded documents — to pre-screen this application (POPIA). No credit check or bureau enquiry runs at this stage; that only happens later if I&apos;m shortlisted and I consent again.
        </span>
      </label>
      {/* Continue pinned to the BOTTOM of the card (mt-auto), bottom-right — the header keeps only Back. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" onClick={onContinue} disabled={!consent || !applicantsGreen || !emailVerified}>Continue to review</ActionButton>
      </div>
    </div>
  )
}

function Row({ k, v }: Readonly<{ k: string; v: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-2 last:border-0">
      <span className="shrink-0 text-[var(--ink-mute)]">{k}</span>
      <span className="text-right font-medium text-[var(--ink)]">{v}</span>
    </div>
  )
}
