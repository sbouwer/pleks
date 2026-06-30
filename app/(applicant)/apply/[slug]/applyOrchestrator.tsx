"use client"

/**
 * app/(applicant)/apply/[slug]/applyOrchestrator.tsx — the interactive apply wizard render shell (exports StepPanel)
 *
 * Route:  /apply/[slug] (the LIVE wizard — the old /preview redirects here)
 * Auth:   public applicant flow, token-bound (resume token = app + org + not-submitted)
 * Notes:  Thin render shell over useApplyFlow (the state machine + handlers + derived) — the wizard's logic lives in
 *         that hook (14Q increment 0b); the panes live in applyIndividual/applyReview/applyCompany, the nav MODEL in
 *         applyNav, the multi-applicant card roster in applyRoster, the shell chrome in applyChrome, and the pure
 *         save-draft payload in applySaveDraft.
 *           Apply-as landing — Just me · Couple/multiple · On behalf/guarantor · Company (type-driven).
 *           Flow — Personal · Finances (Employment/Income/Expenses) · Documents · Review; sole-prop prepends a
 *             Business pane (offset 1); a juristic company runs the company entity panes then the director's flow.
 *           Multi-applicant — each party signs off (verify email + consent), then a CARD ROSTER gates Review&Submit
 *             on everyone being green (see project_pleks_apply_multiapplicant_roster).
 *         Submit: POST /submit runs the zero-AI Step-1 free assessment (declared affordability + readiness; NO deep
 *         scan/poll — that's the agent shortlist stage). The REAL submission is POST /submit-to-agent (sets
 *         submitted_at, idempotent). The server page renders the shell + side cards and passes slug/orgId/rent.
 */

import { type ReactNode } from "react"
import { toast } from "sonner"
import { CheckCircle2, Users, ArrowLeft, ArrowRight, Clock } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { StepCompanyDetails, StepCompanyReview } from "./applyCompany"
import { type CoRole, SELF_EMPLOYED_TYPES, STEP_EXPENSES, STEP_DOCUMENTS, STEP_DOCS_OPTIONAL, STEP_REVIEW } from "./applyDomain"
import { ApplyAsPane } from "./applyLanding"
import { StepPersonal, StepAddress, StepEmployment, StepIncome, StepExpenses, StepDocuments } from "./applyIndividual"
import { StepSubmit, ConsentVerify } from "./applyReview"
import { ApplicationStatusMenu } from "./applyStatusMenu"
import { StepBar, SubTabs, ApplyNavRail } from "./applyNav"
import type { PartyFormState } from "@/lib/parties/partyValidation"
import { useApplyFlow, type ResumeState, type ApplyActor } from "./useApplyFlow"

export type { ResumeState }

// "done" = the Step-1 free assessment is ready to show (it's instant — no processing/poll). The deep-scan ruling
// moved off the applicant flow to the agent's shortlist step (Step 2). (ADDENDUM_14M three-step funnel)

export function StepPanel({ slug, orgId, listingTitle, leaseType, askingRentCents, prefill, resume, verifiedEmail, actor, agentCard, listingCard }: Readonly<{
  slug: string; orgId: string; listingTitle?: string; leaseType: "residential" | "commercial"; askingRentCents: number
  prefill?: Partial<PartyFormState> | null
  resume?: ResumeState | null
  /** the logged-in visitor's account email (already confirmed) — if it matches, skip the email-OTP gate. */
  verifiedEmail?: string | null
  /** 14R: who this session belongs to (default = the lead). A co peer passes { isLead:false, coId } to run the
   *  same flow at the hub / their own card, token-as-proof, writing to the co endpoint. */
  actor?: ApplyActor
  /** the agent card, rendered at the bottom of the desktop side column (full-page shell). */
  agentCard?: ReactNode
  /** the home being applied for — shown in the side column BEFORE begin; replaced by the step rail after. */
  listingCard?: ReactNode
}>) {
  const f = useApplyFlow({ slug, orgId, listingTitle, leaseType, askingRentCents, prefill, resume, actor })
  const {
    commercial, type, form, set, errors, emp, setEmp, income, setIncome,
    dependentAdults, setDependentAdults, dependentMinors, setDependentMinors, commitments, setCommitments,
    applicationId, token, busy, saved, justSaved, resumeLink, emailed, saveModalOpen, setSaveModalOpen, setEmailVerified,
    coApplicants, setCoApplicants, company, setCompany, companyImDirector, setCompanyImDirector, companyRole,
    addApplicantOpen, setAddApplicantOpen, newCo, setNewCo, begun, docFiles, docEscape, setDocEscape,
    consent, setConsent, companyConsent, setCompanyConsent, atRoster, amendGateStep, setAmendGateStep,
    screeningStatus, assessment,
    selectType, beginApplication, goBack, onOpenCard, backToMenu, resendResumeLink, loginToPrefill, saveAndExit,
    confirmAddApplicant, uploadDoc, removeDoc, renameDoc, amendAt, submitApplication, submitToAgent, afterCompanyReview, finishDocuments,
    personalStep, docCategories, companyDocCategories, applicantsGreen, emailGateSatisfied,
    statusMenuCompany, statusMenuPersons, canSubmit, canCoSubmit, coSubmitted, coPeersIncomplete, disclaimer, scrollCls, inWizard, activeKey, activeGroup, headerTitle, headerSub,
    railNav, railStep, railMaxReached, navStates, onNav, onJumpRail, navNext, showBackBtn, showSaveBtn,
    reviewUnlocked, onReviewStep,
  } = f
  const isCo = actor ? !actor.isLead : false // 14R: a co sends its access token as `ct` to AccountStep/link-account

  // The active form pane for the current step — kept here (it's render). Works for personal AND the sole-prop
  // machine (co-info at step 0, then the personal panes via personalStep).
  function renderFormPane() {
    if (!type) return null // narrows ApplicantType for the panes below (only ever rendered when type is set)
    // Company ENTITY panes (sole prop has only co-info; juristic has info · address · finances · documents).
    if (activeKey === "co-info") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={0} />
    if (activeKey === "co-address") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={1} />
    if (activeKey === "co-finances") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={2} />
    if (activeKey === "co-docs") return <StepDocuments tab="required" categories={companyDocCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (activeKey === "co-docs-opt") return <StepDocuments tab="optional" categories={companyDocCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (activeKey === "co-review") return <StepCompanyReview company={company} setCompany={setCompany} signOffEmail={(type === "company" && !companyImDirector && coApplicants[0]) ? coApplicants[0].email : form.email} applicationId={applicationId} token={token} isCo={isCo} emailVerified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} consent={companyConsent} setConsent={setCompanyConsent} imDirector={companyImDirector} companyRole={companyRole} onContinue={afterCompanyReview} busy={busy} />
    if (personalStep === 0) return <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} coApplicants={coApplicants} />
    if (personalStep === 1) return <StepAddress form={form} set={set} errors={errors} />
    if (personalStep === 2) return <StepEmployment emp={emp} setEmp={setEmp} />
    if (personalStep === 3) return <StepIncome income={income} setIncome={setIncome} variable={SELF_EMPLOYED_TYPES.includes(emp.employment_type) || emp.employment_type === "commission"} />
    if (personalStep === STEP_EXPENSES) return <StepExpenses dependentAdults={dependentAdults} setDependentAdults={setDependentAdults} dependentMinors={dependentMinors} setDependentMinors={setDependentMinors} commitments={commitments} setCommitments={setCommitments} />
    if (personalStep === STEP_DOCUMENTS) return <StepDocuments tab="required" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (personalStep === STEP_DOCS_OPTIONAL) return (
      <div className="flex min-h-full flex-col gap-6">
        <StepDocuments tab="optional" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
        {/* SECTION sign-off — consent is captured here (per member), so the application Review is consent-free. */}
        <ConsentVerify applicationId={applicationId} token={token} isCo={isCo} email={form.email} signedInEmail={verifiedEmail} verified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} consent={consent} setConsent={setConsent}>
          I consent to Pleks processing the information and documents I&apos;ve provided — including automated (AI) analysis of my uploaded documents — to pre-screen this application (POPIA). No credit check or bureau enquiry runs at this stage; that only happens later if I&apos;m shortlisted and I consent again.
          {coApplicants.length > 0 ? <> As this is a JOINT application, my co-applicants can see the shared affordability summary; my raw ID, bank-account and credit details are not shared with them.</> : null}
        </ConsentVerify>
        {/* The section sign-off action lives bottom-right in the pane (like the company co-review), not the top nav.
            14R: gated on emailGateSatisfied too — the account must be created + bound before consent is captured. */}
        <div className="mt-auto flex justify-end pt-3">
          <ActionButton tone="primary" onClick={finishDocuments} disabled={!consent || !emailGateSatisfied || busy}>Complete my part</ActionButton>
        </div>
      </div>
    )
    if (personalStep === STEP_REVIEW) return <StepSubmit emp={emp} askingRentCents={askingRentCents} applicantsGreen={applicantsGreen} screeningStatus={screeningStatus} assessment={assessment} onAmend={amendAt} onContinue={submitApplication} onAddApplicant={() => setAddApplicantOpen(true)} applicationId={applicationId} token={token} busy={busy} readOnly={isCo} />
    return null
  }
  // Desktop = vertical step rail (left) + form panel; mobile/short = horizontal step bar atop the panel.
  // NB: the [@media …] variant must be written out literally on each class — Tailwind never generates CSS for
  // a variant assembled from a template literal (it only scans complete class strings in source).

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:flex-row [@media(min-width:1024px)_and_(min-height:700px)]:items-stretch">
      {/* Desktop side column — the home being applied for BEFORE begin, then the step rail once begun (+ agent
          anchored at the bottom either way). */}
      <aside className="hidden shrink-0 [@media(min-width:1024px)_and_(min-height:700px)]:flex [@media(min-width:1024px)_and_(min-height:700px)]:w-[300px] [@media(min-width:1024px)_and_(min-height:700px)]:flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
        {begun ? (
          /* The CONSTANT nav (ADDENDUM_14Q resequence): "Application overview" + "Review & submit" frame the current
             sub-flow's step rail (steps show only while editing a card). Same on the hub and inside a section — no
             "Apply as" return. Rail card FILLS the column (fixed outer height → expanding never shifts layout); its
             BODY scrolls so items stay reachable when short. */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
            <div className="flex shrink-0 items-center border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
                Your application
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <ApplyNavRail
                overviewActive={atRoster} onOverview={backToMenu} inSubFlow={begun && !atRoster && !onReviewStep}
                reviewActive={onReviewStep} reviewEnabled={reviewUnlocked} showReview={canSubmit || canCoSubmit}
                onReview={() => onOpenCard("review")}
                model={railNav} states={navStates} step={railStep} maxReached={railMaxReached} onNav={onNav} onJumpStep={onJumpRail}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{listingCard}</div>
        )}
        {/* Agent card — fixed, anchored below the side column. */}
        {agentCard && <div className="mt-4 shrink-0">{agentCard}</div>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0" style={{ maxWidth: "none", width: "100%" }}>

        {/* Mobile/short: horizontal step bar + sub-tabs (on desktop the rail handles both) — scoped to a sub-flow,
            hidden on the status hub (ADDENDUM_14Q §4). */}
        {!atRoster && (
          <div className="[@media(min-width:1024px)_and_(min-height:700px)]:hidden">
            <StepBar states={navStates} onNav={onNav} />
            {inWizard && <SubTabs model={railNav} activeGroup={activeGroup} step={railStep} maxReached={railMaxReached} onJumpStep={onJumpRail} />}
          </div>
        )}

        {/* Panel header — mirrors the rail's "Your application" header (amber tick + step · section) so the rule
            continues across the nav and the panel. Shows on the landing too ("Apply as · Pre-selection"). */}
        {/* The side column differs by state — landing = listing DetailCard, wizard = the step-rail card — and
            their headers sit at slightly different heights, so the panel header needs a per-state top offset. */}
        <div className={`relative mb-3 flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-2.5 ${begun ? "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-6" : "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-[18px]"}`}>
            {/* The amber-tick panel header shows in EVERY phase (hub · section · landing) so the rule continues across
                the nav and panel. On the hub it reads "Application overview · {unit}" (the menu body drops its own
                heading to a one-line hint to avoid a double title). */}
            <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--ink)]">
              <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
              <span className="truncate">{headerTitle}<span className="font-normal text-[var(--ink-mute)]"> · {headerSub}</span></span>
            </h2>
            {/* TRANSIENT "Saved ✓" — flashes (green, pops in) for ~2.5s after an ACTUAL save, then disappears.
                ABSOLUTELY centred on the card width (pb-2.5 aligns it with the title row) so it doesn't drift between
                pages as the title / action-button widths change. pointer-events-none so it never blocks the buttons. */}
            {justSaved && (
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center pb-2.5">
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 animate-in fade-in-0 zoom-in-95 duration-300" title="Progress saved just now">
                  <CheckCircle2 className="size-3.5" /> Saved
                </span>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {/* Return to the overview hub from within a section — MOBILE/short only (desktop has the persistent
                  "Application overview" item in the left rail, so the header button would be redundant there). */}
              {inWizard && !atRoster && (
                <ActionButton tone="secondary" size="sm" icon={<Users className="size-4" />} onClick={backToMenu} disabled={busy} className="whitespace-nowrap [@media(min-width:1024px)_and_(min-height:700px)]:hidden">Overview</ActionButton>
              )}
              {showBackBtn && (
                <ActionButton tone="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={goBack} disabled={busy}>Back</ActionButton>
              )}
              {navNext && (
                <ActionButton tone={navNext.primary ? "primary" : "secondary"} size="sm" onClick={navNext.onClick} disabled={busy || navNext.disabled} className="whitespace-nowrap">
                  {navNext.primary ? navNext.label : <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{navNext.label} <ArrowRight className="size-4" /></span>}
                </ActionButton>
              )}
              {showSaveBtn && (
                <ActionButton tone="secondary" size="sm" icon={<Clock className="size-4" />} onClick={saveAndExit} disabled={busy} className="whitespace-nowrap" title="Save & email a link to finish later">
                  {saved ? "Continue later" : "Save & finish later"}
                </ActionButton>
              )}
            </div>
          </div>

        {!begun && (
          <div className={scrollCls}>
            <ApplyAsPane
              commercial={commercial} type={type} onSelect={selectType} form={form} set={set}
              coApplicants={coApplicants} setCoApplicants={setCoApplicants} company={company} setCompany={setCompany}
              imDirector={companyImDirector} setImDirector={setCompanyImDirector}
              loggedInEmail={verifiedEmail ?? null} onResend={resendResumeLink} onLogin={loginToPrefill}
              onBegin={beginApplication} resuming={!!resume} busy={busy}
            />
          </div>
        )}

        {/* "Your application status" hub (ADDENDUM_14Q) — the persistent home for EVERY application: open a card to
            complete it, return here on save/sign-off, Review & Submit once every card is green. An office-manager who
            has handed the company off lands here too (company ✓, director status-only; submit isn't theirs to press). */}
        {begun && atRoster && (
          <div className={scrollCls}>
            {coSubmitted ? (
              /* 14R §4 — a co peer has submitted the application to the agent. Terminal confirmation (the co never
                 sees the affordability review — POPIA §5). */
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <h2 className="text-xl font-semibold text-[var(--ink)]">Application submitted ✓</h2>
                <p className="max-w-md text-sm leading-relaxed text-[var(--ink-soft)]">Thanks — your details and consent are recorded, and the application has gone to the agent. You can close this page.</p>
              </div>
            ) : (
              <>
                <ApplicationStatusMenu
                  unitTitle={listingTitle ?? "this home"}
                  company={statusMenuCompany}
                  persons={statusMenuPersons}
                  onOpen={onOpenCard}
                  onSubmit={() => onOpenCard("review")}
                  busy={busy}
                  canSubmit={canSubmit}
                />
                {/* A co peer submits the whole application straight from the hub once EVERYONE's part is done (no
                    affordability review — POPIA §5). Until then the action is held with a "waiting on N" note rather
                    than offered-then-bounced; the server re-checks all-green regardless. */}
                {canCoSubmit && (
                  <div className="mt-4 flex flex-col items-stretch gap-1.5 border-t border-[var(--rule)] pt-4">
                    {coPeersIncomplete > 0 ? (
                      <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                        <Clock className="mt-0.5 size-5 shrink-0 text-[var(--ink-mute)]" />
                        <span>Your part is in. Waiting for {coPeersIncomplete} other applicant{coPeersIncomplete === 1 ? "" : "s"} to finish — the application goes to the agent once everyone&apos;s done.</span>
                      </div>
                    ) : (
                      <ActionButton tone="primary" onClick={submitToAgent} disabled={busy}>Submit application to the agent</ActionButton>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {begun && type !== null && !atRoster && (
          <div className={scrollCls}>{renderFormPane()}</div>
        )}

        {/* Footer — the disclaimer only (nav buttons live in the panel header now), pinned to the bottom. The
            negative bottom margin pulls it into the fs-panel's 42px bottom padding so its gap from the panel edge
            matches the header's gap from the top. */}
        <div className="mt-auto flex shrink-0 items-start gap-3 border-t border-[var(--rule)] pt-4 [@media(min-width:1024px)_and_(min-height:700px)]:-mb-8">
          <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--ink-soft)]">
            <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} />
            {disclaimer}
          </span>
        </div>
      </div>

      {/* Agent contact on mobile/short (the desktop rail that holds it is hidden here) */}
      {agentCard && <div className="mt-4 [@media(min-width:1024px)_and_(min-height:700px)]:hidden">{agentCard}</div>}

      {/* Resume-link confirmation modal — shown after an explicit Save & finish later. */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setSaveModalOpen(false)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
              <CheckCircle2 className="size-5 text-emerald-600" /> Saved — here&apos;s your link to continue
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
              {emailed
                ? <>This link is how you pick up where you left off — from any device, any time. We&apos;ve emailed it to <strong className="text-[var(--ink)]">{form.email}</strong>; copy it below too if you like.</>
                : <>This link is how you pick up where you left off — from any device, any time. Copy it below and keep it somewhere safe.</>}
            </p>
            {resumeLink && (
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={resumeLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-2.5 py-1.5 text-xs text-[var(--ink-soft)]" />
                <ActionButton tone="secondary" onClick={() => { void navigator.clipboard?.writeText(resumeLink); toast.success("Resume link copied.") }}>Copy</ActionButton>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <ActionButton tone="primary" onClick={() => setSaveModalOpen(false)}>Done</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Add-applicant modal — invited from the review when affordability is short. */}
      {addApplicantOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setAddApplicantOpen(false)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--ink)]">Add an applicant</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">We&apos;ll email them a secure link to add their own details, documents and consent. Their income counts toward affordability once they finish their part.</p>
            <div className="mt-3 flex flex-col gap-2">
              <FieldGrid>
                <TextField label="First name" value={newCo.firstName} onChange={(v) => setNewCo({ ...newCo, firstName: v })} required />
                <TextField label="Last name" value={newCo.lastName} onChange={(v) => setNewCo({ ...newCo, lastName: v })} />
                <TextField label="Email" type="email" value={newCo.email} onChange={(v) => setNewCo({ ...newCo, email: v })} required />
                <TextField label="ID number" value={newCo.idNumber} onChange={(v) => setNewCo({ ...newCo, idNumber: v })} required />
              </FieldGrid>
              <SelectField label="They are" value={newCo.role} onChange={(v) => setNewCo({ ...newCo, role: v as CoRole })} options={[{ value: "co_applicant", label: "A co-applicant (lives here / on the lease)" }, { value: "guarantor", label: "A guarantor / surety (backs the rent)" }]} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton tone="secondary" onClick={() => setAddApplicantOpen(false)} disabled={busy}>Cancel</ActionButton>
              <ActionButton tone="primary" icon={<Users className="size-4" />} onClick={confirmAddApplicant} disabled={busy}>Invite applicant</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* 14R amend gate — editing an already-COMPLETED section requires being SIGNED IN as the section owner (the
          account created at completion replaces the old email-OTP re-verify). passAmendGate opens this only when the
          editor isn't signed in as the owner; signing in and returning lets the edit proceed. */}
      {amendGateStep !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setAmendGateStep(null)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--ink)]">Sign in to edit</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">This part of the application is already complete. Please sign in as <strong className="text-[var(--ink)]">{form.email}</strong> to make changes.</p>
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton tone="secondary" onClick={() => setAmendGateStep(null)} disabled={busy}>Cancel</ActionButton>
              <ActionButton tone="primary" onClick={() => { globalThis.location.href = `/login?next=${encodeURIComponent(globalThis.location.pathname + globalThis.location.search)}` }}>Sign in</ActionButton>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}
