"use client"

/**
 * app/(applicant)/apply/[slug]/applyReview.tsx — the shared Review / submit step
 *
 * Notes:  The application-review + submit surface (declared Step-1 free assessment, email verify, submit-to-agent).
 *         Shared bookend for BOTH flows — the orchestrator (StepPanel) renders it last, after the chosen flow.
 *         Owns its own helpers; shares only bricks + applyDomain.
 */
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { toast } from "sonner"
import { AlertCircle, Building2, CheckCircle2, Fingerprint, Loader2, Pencil, ShieldCheck, User, Users } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { useEmailOtpSignup } from "@/lib/auth/useEmailOtpSignup"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"
import { formatZAR } from "@/lib/constants"
import { StepHeading } from "./applyShared"
import { type Emp, type ScreeningStatus, employmentLabel } from "./applyDomain"


// ── Step 6 — Submit → instant Step-1 FREE assessment (declared affordability + readiness; zero-AI) ───────────
// The deep-scan ruling UI (ProcessingView/RulingView/poll) was removed here: the applicant no longer triggers an
// AI deep scan at submit. That runs later, on the agent's shortlist (Step 2). (ADDENDUM_14M three-step funnel)

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
// Company-verdict copy (the company is the payer + the directors are the surety) — by verdict, no nested ternaries.
const COMPANY_AFF_CLAUSE: Record<string, string> = {
  strong: "the company's declared surplus covers the rent",
  backstopped: "the company's surplus is thin for the rent, but the directors' surety can carry it",
  fail: "neither the company's surplus nor the directors' surety covers the rent on the figures provided",
}
const COMPANY_NOTE: Record<string, string> = {
  strong: "The company's declared surplus covers the rent on its own figures.",
  backstopped: "The company's surplus is thin for the rent, but the directors' combined surety can carry it (see the cards below).",
  fail: "Neither the company's surplus nor the directors' surety covers the rent on the figures provided — an affordability concern.",
}
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
  const docsAllIn = a.allRequiredDocsPresent
  // Company: the COMPANY is the payer (surplus vs rent) + the directors are the surety — read off the company
  // verdict, NOT the signing director's personal ratio (which is the wrong frame for a juristic applicant).
  if (a.isCompany) {
    const affClause = COMPANY_AFF_CLAUSE[a.companyVerdict ?? "fail"] ?? COMPANY_AFF_CLAUSE.fail
    const stabClause = ["the signing director's identity verified", docsAllIn ? "company documents in" : "company documents still to complete"].join(", ")
    const closing = a.companyVerdict !== "fail" && docsAllIn ? "A complete company application." : "Add the rest to strengthen it."
    return `On what you've provided: ${affClause}. ${stabClause.charAt(0).toUpperCase()}${stabClause.slice(1)}. ${closing}`
  }
  const residual = a.randLeftAfterObligationsCents ?? a.randLeftAfterRentCents
  const tenure = tenureLabel(a.employment.tenureMonths)
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

const COMPANY_BADGE: Record<string, { label: string; cls: string }> = {
  strong: { label: "Affordable", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  backstopped: { label: "Director-backed", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  fail: { label: "Concern", cls: "border-red-200 bg-red-50 text-red-700" },
}

/** The director-surety backstop in one line — three reads by the strongest surety unit's residual vs the rent:
 *  full cover (good), partial (some but < rent), or none (0). Context, never a fail — the company may stand alone. */
function DirectorSuretyLine({ residualCents, rentCents }: Readonly<{ residualCents: number; rentCents: number }>) {
  const cls = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-soft)]"
  if (rentCents > 0 && residualCents >= rentCents)
    return <p className={cls}>The directors&apos; declared surety also covers the rent on its own — a solid personal backstop behind the company figures.</p>
  if (residualCents > 0)
    return <p className={cls}>The directors&apos; declared surety is partial — it doesn&apos;t fully cover the rent on its own, so the company carries most of it. Your agent may ask for additional director surety.</p>
  return <p className={cls}>The directors declared no personal surety — affordability rests on the company&apos;s figures alone. Your agent may ask a director to stand surety.</p>
}

/** Company affordability — the COMPANY is the payer (monthly surplus = money in − out, vs rent); the directors are
 *  the surety (their cards sit on the roster). Distinct from the personal residual card, which reads the director as
 *  the tenant — the wrong frame for a juristic applicant. */
function CompanyAffordabilityCard({ assessment, askingRentCents }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number }>) {
  const surplus = assessment.companyNetMonthlyCents ?? 0
  const turnover = assessment.companyTurnoverMonthlyCents ?? 0
  const verdict = assessment.companyVerdict ?? "fail"
  const badge = COMPANY_BADGE[verdict] ?? COMPANY_BADGE.fail
  const afterRent = surplus - askingRentCents
  const note = COMPANY_NOTE[verdict] ?? COMPANY_NOTE.fail
  return (
    <div className="flex flex-col gap-4 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-5">
      <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]">
        <span className="shrink-0">Company affordability</span>
        <span aria-hidden className="h-px flex-1 bg-[var(--rule)]" />
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${badge.cls}`}>{badge.label}</span>
      </h3>
      <dl className="flex flex-col gap-2.5 text-sm">
        {turnover > 0 && <div className="flex justify-between gap-3"><dt className="text-[var(--ink-soft)]">Turnover (money in)</dt><dd className="text-[var(--ink-soft)]">{formatZAR(turnover)}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-[var(--ink-soft)]">Monthly surplus (in − out)</dt><dd className="font-medium text-[var(--ink)]">{formatZAR(surplus)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span className="size-2 shrink-0 rounded-full bg-slate-400" /> This rent</dt><dd className="text-[var(--ink-soft)]">− {formatZAR(askingRentCents)}</dd></div>
      </dl>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
        <span className="text-sm font-medium text-[var(--ink)]">{afterRent >= 0 ? "Surplus after rent" : "Shortfall on the company"}</span>
        <span className={`text-xl font-semibold ${afterRent >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatZAR(afterRent)}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--ink-mute)]">{note} The declared figures will be verified against the documents you&apos;ve provided.</p>
      {/* Director-surety context (not a fail) — the strength of the personal backstop behind the company figures.
          Three reads: full cover (good), partial, or none. */}
      <DirectorSuretyLine residualCents={assessment.guarantorBestResidualCents} rentCents={askingRentCents} />
    </div>
  )
}

/** Personal affordability — the residual card (declared income − commitments − rent → left over). The applicant IS
 *  the tenant here (couple/guarantor income is already combined in the assessment). */
function PersonalAffordabilityCard({ assessment, askingRentCents, onAddApplicant }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number; onAddApplicant?: () => void }>) {
  const incomeCents = assessment.combinedIncomeCents
  const oblCents = assessment.declaredObligationsCents
  const residualCents = assessment.randLeftAfterObligationsCents ?? assessment.randLeftAfterRentCents ?? (incomeCents - askingRentCents - oblCents)
  const ratioPct = assessment.declaredRatioPct
  const multiple = assessment.incomeMultiple
  const badge = AFFORD_BADGE[assessment.affordabilityTier] ?? AFFORD_BADGE["no-income"]
  const short = assessment.affordabilityTier !== "within" // marginal / below / no-income → prompt "Add applicant"
  const pct = (n: number) => (incomeCents > 0 ? Math.max(0, Math.min(100, Math.round((n / incomeCents) * 100))) : 0)
  return (
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
      {short && onAddApplicant && (
        <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
          <p className="text-xs leading-relaxed text-[var(--ink-soft)]">{assessment.affordabilityTier === "no-income" ? "No income declared yet." : "Rent is high relative to your declared income."} Adding a co-applicant or guarantor whose income counts would strengthen affordability.</p>
          <ActionButton tone="secondary" size="sm" icon={<Users className="size-4" />} className="mt-2" onClick={onAddApplicant}>Add applicant</ActionButton>
        </div>
      )}
    </div>
  )
}

/** Step-1 FREE assessment — the application review: Completeness (what's done / still to add) + Residual
 *  affordability (income vs commitments + the residual + a tier read; prompts "Add applicant" when short).
 *  Re-runnable for free; the J1 gate (all co-applicants complete) blocks submit. (ADDENDUM_14M funnel) */
function FreeAssessmentView({ assessment, askingRentCents, emp, onAmend, onSubmitToAgent, onAddApplicant, readOnly = false }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number; emp: Emp; onAmend?: (s: number) => void; onSubmitToAgent?: () => Promise<boolean>; onAddApplicant?: () => void; readOnly?: boolean }>) {
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function doSubmit() {
    if (!onSubmitToAgent) return
    setSubmitting(true)
    const ok = await onSubmitToAgent()
    if (ok) setDone(true)
    else setSubmitting(false)
  }
  if (done) return <HandoffView />
  // The applicant ROSTER lives only on the overview hub now (one overview page) — the review goes straight to the
  // assessment summary + submit. Editing is via the overview / the AmendBar below.

  // Ready — a structured four-dimension read (Affordability · Identity & stability · Declared income · Documents)
  // topped by a written one-line summary. All declared/unverified, zero-AI. The verdict is scoped to the
  // APPLICATION ("complete and affordable on the figures you provided"), never the outcome — the agent decides.
  const identityOk = !assessment.identity.underageCannotSign && assessment.identity.dobMatchesDeclared !== false
  const tenure = tenureLabel(assessment.employment.tenureMonths)
  const empLabel = emp.employment_type ? employmentLabel(emp.employment_type) : null
  // Company: "good" = company affords OR the directors' surety backs it (verdict ≠ fail); personal: within-ratio.
  // Both gate on readiness. (The affordability-card figures live in PersonalAffordabilityCard / CompanyAffordabilityCard.)
  const verdictGood = (assessment.isCompany ? assessment.companyVerdict !== "fail" : assessment.affordabilityTier === "within") && assessment.readiness.band === "ready"
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
        {/* Company → the company-payer card (surplus vs rent + director surety); personal → the residual card. */}
        {assessment.isCompany
          ? <CompanyAffordabilityCard assessment={assessment} askingRentCents={askingRentCents} />
          : <PersonalAffordabilityCard assessment={assessment} askingRentCents={askingRentCents} onAddApplicant={onAddApplicant} />}

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

      {/* Something to change? One line — edit your details (or go back to the overview to edit any card). Re-opening
          the review re-checks automatically, so there's no manual "re-check" here. */}
      {!verdictGood && !readOnly && onAmend && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-3">
          <p className="text-xs text-[var(--ink-mute)]">Want to change something before you submit?</p>
          <ActionButton tone="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onAmend(0)} className="shrink-0">Edit details</ActionButton>
        </div>
      )}

      {/* What happens next — sets the journey, reinforces pre-selection + the consent/credit-check expectation. */}
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <h3 className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span className="shrink-0">What happens next</span><span aria-hidden className="h-px flex-1 bg-[var(--rule)]" /></h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">You submit → if the agent shortlists you, your documents are verified against what you declared → an optional credit check runs only with your explicit consent, and you&apos;ll receive a copy.</p>
      </div>

      {/* Submit pinned to the BOTTOM of the card (mt-auto), bottom-right. Hidden in read-only (the view-only link from
          the submission email) — there's nothing to change or re-send there. */}
      {!readOnly && (
        <div className="mt-auto flex justify-end pt-3">
          <ActionButton tone="primary" icon={<CheckCircle2 className="size-4" />} disabled={submitting} onClick={doSubmit}>{submitting ? "Submitting…" : "Submit application"}</ActionButton>
        </div>
      )}
    </div>
  )
}

/** Read-only render of a stored assessment — the view-only review reached from the submission email (14R §4). */
export function ReadOnlyAssessment({ assessment, askingRentCents, emp }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number; emp: Emp }>) {
  return <FreeAssessmentView assessment={assessment} askingRentCents={askingRentCents} emp={emp} readOnly />
}

/** Account-at-completion (14R auth amendment) — the successor to the email-OTP VerifyEmail. "Start cheap, end
 *  expensive": at sign-off the applicant creates a Pleks account with a 6-digit email code entered IN-FLOW (or, if
 *  already signed in, skips the code) — then link-account establishes the tenant binding so CONSENT is captured
 *  against the auth user (CD §5 POPIA binding).
 *
 *  CD constraints: (1) link-account ALWAYS runs — a signed-in user skips only the code, never the binding (else the
 *  resolver's session branch has nothing to match and they can't resume/edit); (2) onReady fires only after the
 *  binding, so consent is captured after auth_user_id exists; (3) resume-after-bounce (account made, left before
 *  consent) returns signed-in → binds on mount → lands on consent, never re-creates the account. Co-aware: a co
 *  sends its access token as `ct`, the lead its app token as `token`. */
export function AccountStep({ applicationId, fillToken, isCo, email, signedInEmail, ready, onReady }: Readonly<{
  applicationId: string | null
  fillToken: string | null            // lead application_tokens token, OR a co's access_token
  isCo: boolean
  email?: string
  signedInEmail?: string | null       // server-rendered session email at load (logged-in / resume-after-bounce)
  ready: boolean
  onReady: () => void
}>) {
  const { send, verify, sending, verifying, sent, error } = useEmailOtpSignup()
  const { enrol, state: pkState, errorMsg: pkError } = useEnrolPasskey()
  const [code, setCode] = useState("")
  const [binding, setBinding] = useState(false)
  const [authed, setAuthed] = useState<boolean>(!!signedInEmail)
  const boundRef = useRef(false)
  // Passkey upsell: only offered after a FRESH account creation this session (not on resume/already-signed-in — that
  // user manages passkeys from their account). The passkey enrols against THIS session's user, which link-account
  // bound to the tenant (tenants.auth_user_id), so it persists on the tenant account for future sign-ins.
  const [justCreated, setJustCreated] = useState(false)
  const [pkChoice, setPkChoice] = useState<"offer" | "done" | "skipped">("offer")
  const pkSupported = !!globalThis.window?.PublicKeyCredential

  // link-account — establish the tenant binding. Idempotent (the promotion dedups on tenant_id/auth user), and ALWAYS
  // runs (CD constraint 1) so a signed-in/returning applicant still gets bound. Returns ok.
  const bind = useCallback(async (): Promise<boolean> => {
    if (!applicationId) return false
    setBinding(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/link-account`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCo ? { ct: fillToken } : { token: fillToken }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast.error(b.error ?? "Could not link your account — please try again."); return false }
      return true
    } catch { toast.error("Could not link your account — please try again."); return false } finally { setBinding(false) }
  }, [applicationId, isCo, fillToken])

  // Already signed in (logged-in OR resume-after-bounce, CD constraints 1 + 3): bind on mount → ready. No code entry.
  useEffect(() => {
    if (ready || boundRef.current || !authed) return
    boundRef.current = true
    void (async () => { if (await bind()) onReady(); else boundRef.current = false })()
  }, [authed, ready, bind, onReady])

  async function onVerify() {
    if (!email) return
    if (!(await verify(email, code))) return // creates + signs in the account (sets the session)
    setJustCreated(true)                     // a fresh account this session → offer the passkey upsell when ready
    setAuthed(true)                          // → the bind effect runs link-account, then onReady
  }

  if (ready) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 rounded-[var(--r-button)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="size-4" /> Account ready{signedInEmail ? <> — <strong>{signedInEmail}</strong></> : null}
        </p>
        {/* Optional, NON-blocking passkey upsell — only after a fresh account creation, and only where supported.
            Enrols against this session's user (which link-account bound to the tenant), so it survives on the
            account; revoke it any time from your account's sign-in settings. Skipping changes nothing. */}
        {justCreated && pkSupported && pkChoice === "offer" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--ink)]"><Fingerprint className="size-4 text-[var(--ink-mute)]" /> Sign in faster next time</p>
              <p className="mt-0.5 text-xs text-[var(--ink-soft)]">Add a passkey — use Face ID, a fingerprint or your device PIN instead of an emailed code.</p>
              {pkError && pkError !== "Cancelled" ? <p className="mt-1 text-xs text-rose-600">{pkError}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ActionButton tone="primary" size="sm" onClick={async () => { if (await enrol()) setPkChoice("done") }} disabled={pkState === "in_progress"}>{pkState === "in_progress" ? "Setting up…" : "Add passkey"}</ActionButton>
              <button type="button" onClick={() => setPkChoice("skipped")} className="text-xs text-[var(--ink-mute)] hover:text-[var(--ink)]">Not now</button>
            </div>
          </div>
        )}
        {pkChoice === "done" && (
          <p className="flex items-center gap-2 rounded-[var(--r-button)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Passkey added — sign in with Face ID / fingerprint next time.
          </p>
        )}
      </div>
    )
  }
  if (authed) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-sm text-[var(--ink-soft)]">
        <Loader2 className="size-4 animate-spin text-[var(--amber)]" /> Linking your account…
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">Create your account to finish</p>
        <p className="mt-0.5 text-xs text-[var(--ink-soft)]">We&apos;ll send a 6-digit code to <strong className="text-[var(--ink)]">{email ?? "your email"}</strong>. Your account secures your application and lets you sign back in to edit it.</p>
        {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      </div>
      {!sent ? (
        <ActionButton tone="primary" size="sm" onClick={() => email && send(email)} disabled={sending || !email} className="shrink-0">{sending ? "Sending…" : "Send code"}</ActionButton>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" className="w-28 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm tracking-[0.3em]" />
          <ActionButton tone="primary" size="sm" onClick={onVerify} disabled={verifying || binding || code.length !== 6}>{verifying || binding ? "…" : "Create account"}</ActionButton>
          <button type="button" onClick={() => email && send(email)} disabled={sending} className="text-xs text-[var(--ink-mute)] hover:text-[var(--ink)]">Resend</button>
        </div>
      )}
    </div>
  )
}

/** The per-applicant sign-off block — email verification + a consent checkbox — shared by the company sign-off
 *  (StepCompanyReview) and the personal review (StepSubmit) so the gate looks/behaves identically; the consent
 *  WORDING differs per applicant, so it's passed as children (#4 of the redundancy cleanup). */
export function ConsentVerify({ applicationId, token, isCo, email, signedInEmail, verified, onVerified, consent, setConsent, children }: Readonly<{
  applicationId: string | null; token: string | null; isCo: boolean; email?: string; signedInEmail?: string | null
  verified: boolean; onVerified: () => void
  consent: boolean; setConsent: (v: boolean) => void; children: ReactNode
}>) {
  return (
    <>
      {/* 14R: account-at-completion replaces the email-OTP verify; consent is captured against the bound auth user. */}
      <AccountStep applicationId={applicationId} fillToken={token} isCo={isCo} email={email} signedInEmail={signedInEmail} ready={verified} onReady={onVerified} />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--amber)]" />
        <span className="text-[13px] leading-relaxed text-[var(--ink-soft)]"><ShieldCheck className="mr-1 inline size-3.5 text-[var(--ink-mute)]" />{children}</span>
      </label>
    </>
  )
}

export function StepSubmit({ emp, askingRentCents, applicantsGreen, screeningStatus, assessment, onAmend, onContinue, onAddApplicant, applicationId, token, busy, readOnly = false }: Readonly<{
  emp: Emp; askingRentCents: number
  applicantsGreen: boolean; screeningStatus: ScreeningStatus; assessment: FreeAssessmentResult | null
  onAmend: (s: number) => void; onContinue: () => void; onAddApplicant: () => void
  applicationId: string | null; token: string | null; busy?: boolean
  /** 14R §5: a co views the shared review READ-ONLY (no submit/amend here — they submit via the hub all-green action). */
  readOnly?: boolean
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

  if (screeningStatus === "done" && assessment) return <FreeAssessmentView assessment={assessment} askingRentCents={askingRentCents} emp={emp} onAmend={onAmend} onSubmitToAgent={submitToAgent} onAddApplicant={onAddApplicant} readOnly={readOnly} />

  // Not done yet — the assessment auto-runs when the review opens (consent is per-section, so there's no consent
  // gate here). Show a brief "preparing" state while it computes; if it isn't running (idle / a failed run), offer a
  // retry so the applicant is never stranded.
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 py-20 text-center">
      {busy ? (
        <>
          <Loader2 className="size-6 animate-spin text-[var(--amber)]" />
          <p className="text-sm text-[var(--ink-soft)]">Preparing your review…</p>
        </>
      ) : (
        <>
          <p className="max-w-sm text-sm text-[var(--ink-soft)]">{applicantsGreen ? "Ready when you are — let's look at your review." : "Finish the outstanding sections first to see your review."}</p>
          <ActionButton tone="primary" onClick={onContinue} disabled={!applicantsGreen}>See my review</ActionButton>
        </>
      )}
    </div>
  )
}

