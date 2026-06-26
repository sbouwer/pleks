"use client"

/**
 * app/(applicant)/apply/[slug]/applyOrchestrator.tsx — the interactive apply wizard (client island; exports StepPanel)
 *
 * Route:  /apply/[slug] (the LIVE wizard — the old /preview redirects here)
 * Auth:   public applicant flow, token-bound (resume token = app + org + not-submitted)
 * Notes:  Owns the wizard state + flow sequencing; the view/nav/domain are decomposed out — panes in
 *         applyIndividual/applyReview/applyCompany, the nav MODEL in applyNav (PERSONAL/SOLEPROP/PTY +
 *         computeStepStates), the multi-applicant card roster in applyRoster, shared types/helpers in applyDomain,
 *         the shell chrome in applyChrome. Flow-shape logic (resolveFlow/resolveNavNext/maritalErrors) sits at
 *         module level to stay under the complexity gate.
 *           Apply-as landing — Just me · Couple/multiple · On behalf/guarantor · Company (type-driven).
 *           Flow — Personal · Finances (Employment/Income/Expenses) · Documents · Review; sole-prop prepends a
 *             Business pane (offset 1); a juristic company runs the company entity panes then the director's flow.
 *           Multi-applicant — each party signs off (verify email + consent), then a CARD ROSTER gates Review&Submit
 *             on everyone being green (see project_pleks_apply_multiapplicant_roster).
 *         Submit: POST /submit runs the zero-AI Step-1 free assessment (declared affordability + readiness; NO deep
 *         scan/poll — that's the agent shortlist stage). The REAL submission is POST /submit-to-agent (sets
 *         submitted_at, idempotent). The server page renders the shell + side cards and passes slug/orgId/rent.
 */

import { useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { CheckCircle2, Users, ArrowLeft, ArrowRight, Clock } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { useBegun } from "./applyChrome"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { type CompanyInfo, isJuristicCompanyType, StepCompanyDetails, StepCompanyReview } from "./applyCompany"
import {
  type ApplicantType, type CoRole, type ScreeningStatus, type SetFn, type DocFile, type CoApplicant, type Emp, type IncomePeriod, type IncomeRow,
  STEP_EXPENSES, STEP_DOCUMENTS, STEP_DOCS_OPTIONAL, STEP_REVIEW, LAST_DATA_STEP,
  SELF_EMPLOYED_TYPES,
  INCOME_LABEL, seedIncomeFor, COMMITMENT_LABEL, seedCommitments,
  intOrNull, allAmountsEmpty, posOrNull, seedIfEmpty, numStr, rowMonthlyCents, totalMonthlyCents, incomeSourcesPayload, incomeKeys, blankCo,
} from "./applyDomain"
import { ApplyAsPane } from "./applyLanding"
import { StepPersonal, StepAddress, StepEmployment, StepIncome, StepExpenses, StepDocuments } from "./applyIndividual"
import { StepSubmit, VerifyEmail } from "./applyReview"
import { ApplicantRoster, CompanyCard, type RosterPerson } from "./applyRoster"
import { PERSONAL_NAV, SOLEPROP_NAV, PTY_NAV, PTY_COMPANY_PANES, computeStepStates, StepRail, StepBar, SubTabs } from "./applyNav"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { deriveDocCategories, categoryForFilename } from "@/lib/applications/docCategories"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors,
} from "@/lib/parties/partyValidation"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"

const TYPE_LABEL: Record<ApplicantType, string> = { individual: "Individual", couple: "Couple", company: "Company", guarantor: "With a guarantor" }
// Nav model + chrome (STEP_GROUPS/PANE_META/GROUP_PANES, StepRail/StepBar/SubTabs, computeStepStates) → ./applyNav.


// Income/employment domain (types, catalogs, money helpers) lives in ./applyDomain — shared by both flows.
// CompanyInfo + the company flow live in ./applyCompany (a separate concern — see the apply-flow architecture).
// "done" = the Step-1 free assessment is ready to show (it's instant — no processing/poll). The deep-scan ruling
// moved off the applicant flow to the agent's shortlist step (Step 2). (ADDENDUM_14M three-step funnel)

/** Apply-only marital/spouse validation (the shared identity validator doesn't cover these). Marital status is
 *  mandatory; married → regime mandatory; married + in community → the spouse must consent (s15 MPA) — either an
 *  existing co-applicant (just pick which, if several) or an external spouse whose details we capture. */
function maritalErrors(form: PartyFormState, coApplicants: CoApplicant[]): PartyErrors {
  const e: PartyErrors = {}
  if (!form.maritalStatus) e.maritalStatus = "Required"
  if (form.maritalStatus === "married" && !form.matrimonialRegime) e.matrimonialRegime = "Required"
  if (form.maritalStatus === "married" && form.matrimonialRegime === "in_community") {
    const candidates = coApplicants.filter((c) => c.role === "co_applicant")
    const spouseIsCo = candidates.length > 0 && (form.spouseIsCoApplicant ?? true)
    if (spouseIsCo) {
      if (candidates.length > 1 && !form.spouseEmail) e.spouseEmail = "Select your spouse"
    } else {
      if (!form.spouseFirstName) e.spouseFirstName = "Required"
      if (!form.spouseLastName) e.spouseLastName = "Required"
      if (!form.spouseIdNumber) e.spouseIdNumber = "Required"
      if (!form.spouseEmail) e.spouseEmail = "Required"
    }
  }
  return e
}
/** "Green" = enough to invite AND link them to the application: a name, an email, and an ID number. */
const coComplete = (c: CoApplicant) => Boolean(c.firstName.trim() && c.email.trim() && c.idNumber.trim())

/** Pane keys that hold PERSONAL details — editing these in a resumed (shared-link) session needs an identity re-verify. */
const PERSONAL_EDIT_KEYS = new Set(["personal", "address", "employment", "income", "expenses"])

/** The company roster's person cards — the director(s), all "outstanding" at the hub (the company section is signed
 *  off; their own personal sections aren't done yet). A director filler (You) leads the list; an office-manager
 *  filler isn't a party, so only the named directors (coApplicants) show. */
function buildCompanyRosterPersons(form: PartyFormState, coApplicants: CoApplicant[], companyRole: string, imDirector: boolean): RosterPerson[] {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const others = coApplicants.map((c): RosterPerson => ({ name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Director", roleLabel: cap(c.designation ?? "director"), status: "outstanding" }))
  if (!imDirector) return others
  const filler: RosterPerson = { name: [form.firstName, form.lastName].filter(Boolean).join(" ") || "You", roleLabel: cap(companyRole), status: "outstanding" }
  return [filler, ...others]
}

/** Flow selection — which step machine + offset for the applicant/company type (module-level to keep the component
 *  under the complexity gate). Sole prop / partnership = the personal machine + a prepended business-info pane
 *  (offset 1); a juristic company runs the short company phase before the director's personal flow. */
function resolveFlow(type: ApplicantType | null, companyType: string, step: number) {
  const company = type === "company"
  const juristic = company && isJuristicCompanyType(companyType)
  const soleProp = company && !juristic
  // companyPaneCount = how many entity panes lead the rail before the personal panes: 0 (personal), 1 (sole prop —
  // a single Business-information pane), PTY_COMPANY_PANES (juristic — the full Company details/finances/documents).
  let nav = PERSONAL_NAV
  let companyPaneCount = 0
  if (soleProp) { nav = SOLEPROP_NAV; companyPaneCount = 1 }
  else if (juristic) { nav = PTY_NAV; companyPaneCount = PTY_COMPANY_PANES }
  return { soleProp, juristic, nav, companyPaneCount, personalStep: step - companyPaneCount }
}

type NavNext = { label: string; onClick: () => void; disabled?: boolean; primary?: boolean } | null
/** The header forward-action for the current step — extracted from the component to keep it under the complexity
 *  gate. Company entity panes dispatch by `activeKey`; the personal/director panes via `personalStep`. */
function resolveNavNext(o: Readonly<{
  inWizard: boolean; atRoster: boolean; activeKey: string | undefined; companyImDirector: boolean; companyRole: string
  personalStep: number; docsReady: boolean; busy: boolean
  continueCompanyInfo: () => void; advanceStep: () => void; afterCompanyReview: () => void; createApplication: () => void
  companyConsent: boolean; emailGateSatisfied: boolean
  continueIdentity: () => void; continueAddress: () => void; continueEmployment: () => void; continueIncome: () => void
  continueDocsRequired: () => void; finishDocuments: () => void
}>): NavNext {
  if (!o.inWizard || o.atRoster) return null // at the roster hub the forward action lives in the roster body
  return companyEntityNavNext(o) ?? personalNavNext(o)
}
/** Company ENTITY panes (sole prop has only co-info; juristic has the full set ending in the co-review sign-off). */
function companyEntityNavNext(o: Readonly<{
  activeKey: string | undefined; companyImDirector: boolean; companyRole: string; busy: boolean
  companyConsent: boolean; emailGateSatisfied: boolean
  continueCompanyInfo: () => void; advanceStep: () => void; afterCompanyReview: () => void; createApplication: () => void
}>): NavNext {
  if (o.activeKey === "co-info") return { label: "Next", onClick: o.continueCompanyInfo }
  if (o.activeKey === "co-address") return { label: "Next", onClick: o.advanceStep }
  if (o.activeKey === "co-finances") return { label: "Next", onClick: o.createApplication } // app created here so the company-docs pane can upload
  if (o.activeKey === "co-docs") return { label: "Next", onClick: o.advanceStep }
  // Company sign-off — verify + consent on the company's behalf, then hand to the director (or email them).
  if (o.activeKey === "co-review") return { label: o.companyImDirector ? "Continue to your application" : `Send to the ${o.companyRole}`, onClick: o.afterCompanyReview, disabled: o.busy || !o.companyConsent || !o.emailGateSatisfied }
  return null
}
/** Personal / director panes (sole prop + the director's private flow reuse these), dispatched by personalStep. */
function personalNavNext(o: Readonly<{
  personalStep: number; docsReady: boolean
  continueIdentity: () => void; continueAddress: () => void; continueEmployment: () => void; continueIncome: () => void
  createApplication: () => void; continueDocsRequired: () => void; finishDocuments: () => void
}>): NavNext {
  if (o.personalStep === 0) return { label: "Next", onClick: o.continueIdentity }
  if (o.personalStep === 1) return { label: "Next", onClick: o.continueAddress }
  if (o.personalStep === 2) return { label: "Next", onClick: o.continueEmployment }
  if (o.personalStep === 3) return { label: "Next", onClick: o.continueIncome }
  if (o.personalStep === STEP_EXPENSES) return { label: "Next", onClick: o.createApplication }
  if (o.personalStep === STEP_DOCUMENTS) return { label: "Next", onClick: o.continueDocsRequired, disabled: !o.docsReady }
  if (o.personalStep === STEP_DOCS_OPTIONAL) return { label: "Next", onClick: o.finishDocuments }
  return null
}

// ── Resume (save & finish later) ──────────────────────────────────────────────
export interface ResumeState {
  applicationId: string; token: string; step: number; savedAt: string | null
  applicantType: ApplicantType | null; company: CompanyInfo | null; emailVerified: boolean
  form: Partial<PartyFormState>; emp: Emp; dependents: number | null
  dependentAdults?: number | null; dependentMinors?: number | null
  incomeSources: { key: string; label: string; amount_cents: number; period: string }[]
  commitments?: { key: string; label: string; amount_cents: number; period: string }[]
  coApplicants: CoApplicant[]; docPaths: { name: string; storagePath: string }[]
}
/** Rebuild an editable line-item grid (income or commitments) from a persisted source list — one row per stored
 *  item (the grid grows from the seed + picker). A key not in the given catalog is a custom "other" row.
 *  amount is rands-as-string (the grid's input shape). */
function rebuildRows(stored: ResumeState["incomeSources"], labelMap: Record<string, string>): IncomeRow[] {
  return stored.map((s, i) => ({
    key: s.key || `other_${i}`,
    label: s.label || labelMap[s.key] || "Other",
    amount: String(s.amount_cents / 100),
    period: (s.period as IncomePeriod) || "month",
    custom: !labelMap[s.key],
  }))
}
/** A resumed draft doesn't persist the chosen party type — infer it from the co-applicants. Company drafts
 *  (not persisted) resume as individual (the rare path); the applicant re-selects the type if needed. */
function inferType(cos: CoApplicant[]): ApplicantType {
  if (cos.some((c) => c.role === "guarantor")) return "guarantor"
  if (cos.some((c) => c.role === "co_applicant")) return "couple"
  return "individual"
}
/** Rebuild docFiles from the paths already in Storage — placeholders (uploaded:true) carry the real storagePath
 *  so they remain removable; the original filename/content is NOT re-rendered (POPIA — show "uploaded", a count). */
function seedDocFiles(income: IncomeRow[], employmentType: string, docPaths: { name: string; storagePath: string }[], idType?: string | null, applicantType?: ApplicantType | null): Record<string, DocFile[]> {
  const cats = deriveDocCategories(incomeKeys(income), employmentType, idType, applicantType)
  const out: Record<string, DocFile[]> = {}
  for (const p of docPaths) {
    const cat = categoryForFilename(p.name, cats)
    out[cat] = [...(out[cat] ?? []), { id: `resumed_${p.name}`, name: "Uploaded document", uploading: false, uploaded: true, storagePath: p.storagePath }]
  }
  return out
}


export function StepPanel({ slug, orgId, listingTitle, leaseType, askingRentCents, prefill, resume, verifiedEmail, agentCard, listingCard }: Readonly<{
  slug: string; orgId: string; listingTitle?: string; leaseType: "residential" | "commercial"; askingRentCents: number
  prefill?: Partial<PartyFormState> | null
  resume?: ResumeState | null
  /** the logged-in visitor's account email (already confirmed) — if it matches, skip the email-OTP gate. */
  verifiedEmail?: string | null
  /** the agent card, rendered at the bottom of the desktop side column (full-page shell). */
  agentCard?: ReactNode
  /** the home being applied for — shown in the side column BEFORE begin; replaced by the step rail after. */
  listingCard?: ReactNode
}>) {
  const commercial = leaseType === "commercial"
  // Resuming a saved draft (the ?app&token link) rehydrates identity/income/employment/docs/co-applicants and
  // drops the applicant back on the step they left. Address isn't persisted by the apply flow, so it re-enters.
  const resumedIncome = resume ? rebuildRows(resume.incomeSources, INCOME_LABEL) : null
  const resumedCommitments = resume?.commitments ? rebuildRows(resume.commitments, COMMITMENT_LABEL) : null
  const [type, setType] = useState<ApplicantType | null>(resume ? (resume.applicantType ?? inferType(resume.coApplicants)) : null)
  const [step, setStep] = useState(resume?.step ?? 0)
  const [maxReached, setMaxReached] = useState(resume?.step ?? 0)

  // Seed identity from the resumed draft (else the logged-in user's own record; financial/employment stay empty
  // for a fresh start but rehydrate on resume).
  const [form, setForm] = useState<PartyFormState>({ idType: "sa_id", ...(prefill ?? {}), ...(resume?.form ?? {}) })
  const [errors, setErrors] = useState<PartyErrors>({})
  const [emp, setEmp] = useState<Emp>(resume?.emp ?? { employment_type: "", employer: "", start_date: "" })
  const [income, setIncome] = useState<IncomeRow[]>(resumedIncome ?? [])
  // Expenses sub-tab. Dependants split into adults (full living-floor cost) + minors (half); school fees are a
  // child-specific cost (offset by maintenance received). Commitments = the itemised debt/contractual grid.
  const resumedMinors = resume?.dependentMinors ?? resume?.dependents // legacy single count → minors
  const [dependentAdults, setDependentAdults] = useState(numStr(resume?.dependentAdults))
  const [dependentMinors, setDependentMinors] = useState(numStr(resumedMinors))
  const [commitments, setCommitments] = useState<IncomeRow[]>(resumedCommitments ?? [])
  const set: SetFn = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const [applicationId, setApplicationId] = useState<string | null>(resume?.applicationId ?? null)
  const [token, setToken] = useState<string | null>(resume?.token ?? null)
  const [busy, setBusy] = useState(false)
  // `saved` = the applicant has explicitly saved at least once (a resumed draft counts) → the CTA shows a green
  // tick. The save confirmation + copy link live in a modal, not the footer (which always shows the disclaimer).
  const [saved, setSaved] = useState<boolean>(!!resume)
  const [resumeLink, setResumeLink] = useState<string | null>(null)
  const [emailed, setEmailed] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean>(resume?.emailVerified ?? false)

  const [coApplicants, setCoApplicants] = useState<CoApplicant[]>(resume?.coApplicants ?? [])
  const [company, setCompany] = useState<CompanyInfo>(resume?.company ?? { companyType: "", companyReg: "" })
  // Company: is the person filling this in the director/signatory themselves? If so they complete the application
  // (their Apply-as details pre-fill the personal flow, no invite); if not, the director is invited to do it.
  const [companyImDirector, setCompanyImDirector] = useState(true)
  // Company flow runs in the main rail (entity panes → the director's private flow). For the OFFICE-MANAGER case
  // (filler isn't the director), the company entity is completed then the director is emailed → "sent" screen.
  const [companySentToDirector, setCompanySentToDirector] = useState(false)
  // The person standing for the company is a director (juristic), a partner (partnership), or the owner (sole prop) —
  // used in all the company copy/toasts so we never call a sole proprietor a "director".
  let companyRole = "owner"
  if (isJuristicCompanyType(company.companyType)) companyRole = "director"
  else if (company.companyType === "partnership") companyRole = "partner"
  // "Add applicant" from the review (when affordability is short) — invite a co-applicant after the app exists.
  const [addApplicantOpen, setAddApplicantOpen] = useState(false)
  const [newCo, setNewCo] = useState<CoApplicant>(blankCo("co_applicant"))
  // "Begun" = past the "Apply as" landing and into the form panes. Lifted to a shared context (applyChrome) so the
  // top-header unit strip can render only once in the application. Resuming a saved draft starts already begun;
  // clicking "Apply as" in the rail re-opens the landing (begun→false) with the chosen type preserved.
  const { begun, setBegun } = useBegun()
  const [docFiles, setDocFiles] = useState<Record<string, DocFile[]>>(resume && resumedIncome ? seedDocFiles(resumedIncome, resume.emp.employment_type, resume.docPaths, resume.form?.idType, resume.applicantType ?? inferType(resume.coApplicants)) : {})
  const [docEscape, setDocEscape] = useState<Record<string, boolean>>({})
  const [consent, setConsent] = useState(false)
  const [companyConsent, setCompanyConsent] = useState(false) // the COMPANY applicant's sign-off consent (co-review)
  const [atRoster, setAtRoster] = useState(false) // the per-applicant roster HUB (after the company sign-off, before the director section)
  // Editing PERSONAL details in a RESUMED session (anyone could hold the shared link) needs a fresh identity check.
  // Fresh fills are unlocked (they verified at sign-off); a resume starts locked until "verify it's you" passes.
  const [amendUnlocked, setAmendUnlocked] = useState(!resume)
  const [amendGateStep, setAmendGateStep] = useState<number | null>(null)
  const [screeningStatus, setScreeningStatus] = useState<ScreeningStatus>("idle")
  const [assessment, setAssessment] = useState<FreeAssessmentResult | null>(null)

  function advance(to: number) { setStep(to); setMaxReached((m) => Math.max(m, to)) }

  /** Navigate to a step, invalidating any cached free-assessment when leaving the review — so changes made on a
   *  data step force a fresh re-run on return instead of showing the stale review. (amendAt does the same for the
   *  in-review amend links.) Route ALL non-forward navigation (Back, rail, sub-tabs) through this. */
  function navTo(to: number) {
    if (to !== STEP_REVIEW) { setScreeningStatus("idle"); setAssessment(null) }
    setBegun(true)
    setStep(to)
  }

  // Pick an application type on the landing (no navigation — the landing stays until "Begin"). Co-applicant rows
  // are seeded for multi-party types so the inline capture has a first row; switching to individual clears them.
  function selectType(t: ApplicantType) {
    setType(t)
    // The card already says who they are, so force every row's role to match it (no per-row choice). Company
    // applies THROUGH its director(s) — capture them like couple (role co_applicant = the signatory on its behalf).
    if (t === "guarantor") setCoApplicants((cur) => (cur.length > 0 ? cur.map((c) => ({ ...c, role: "guarantor" as CoRole })) : [blankCo("guarantor")]))
    else if (t === "couple") setCoApplicants((cur) => (cur.length > 0 ? cur.map((c) => ({ ...c, role: "co_applicant" as CoRole })) : [blankCo("co_applicant")]))
    // Company: row 1 = YOU (the form); co-directors/signatories are added as needed. Individual: no co-rows.
    else setCoApplicants([])
  }

  /** Begin (first time) / Continue (re-editing "Apply as"): validate the chosen type + parties, then enter the
   *  form panes. Invites are held in state and dispatched once the application exists (createApplication). */
  function beginApplication() {
    if (!type) { toast.error("Choose how you're applying."); return }
    if (type === "company" && !company.companyType) { toast.error("Please select the company type."); return }
    // Couple / guarantor: the co-person (row 2) needs basics; the primary is YOU (the form), validated in the flow.
    if ((type === "couple" || type === "guarantor") && !(coApplicants[0] && coComplete(coApplicants[0]))) {
      toast.error("Add the co-applicant's name, email and ID number."); return
    }
    // Company: YOU are row 1 (the form). If you're the director, you ARE the primary — validate your basics. If
    // filling on behalf, you're not a party, so the named director (row 2) is who's emailed — validate them.
    if (type === "company") {
      if (companyImDirector && !(form.firstName?.trim() && form.email?.trim() && form.idNumber?.trim())) {
        toast.error(`Add your name, email and ID number as the ${companyRole}.`); return
      }
      if (!companyImDirector && !(coApplicants[0] && coComplete(coApplicants[0]))) {
        toast.error(`Add the ${companyRole}'s name, email and ID number.`); return
      }
      // A company contracts through a signatory — at least one DIRECTOR (owner for a sole prop) must be on the
      // application to sign. The filler counts unless they set a non-signing role (shareholder / guarantor / other).
      const SIGNATORY_ROLES = ["director", "owner", "partner"]
      const fillerSignatory = companyImDirector && (!company.fillerDesignation || SIGNATORY_ROLES.includes(company.fillerDesignation))
      const coSignatory = coApplicants.some((c) => SIGNATORY_ROLES.includes(c.designation ?? "director"))
      if (!fillerSignatory && !coSignatory) {
        toast.error("A director is required to sign on the company's behalf — add a director, or set someone's designation to Director."); return
      }
    }
    setBegun(true)
    setMaxReached((m) => Math.max(m, step))
  }

  function goBack() {
    if (atRoster) { setAtRoster(false); return } // from the roster hub → back to the company sign-off pane
    if (step === 0) setBegun(false) // back from the first pane (personal info / company info) → the landing
    else navTo(step - 1)
  }

  // After the JURISTIC company entity panes, an OFFICE-MANAGER filler (not the director) hands off: save + email the
  // director their link + show the "sent" state. (The "it's me" director instead continues to the private flow.)
  async function sendToDirector() {
    setBusy(true)
    try {
      const r = await saveDraft(step + 1, { explicit: true })
      if (!r) return
      await dispatchInvites(r.id)
      setCompanySentToDirector(true)
      toast.success(`Sent to the ${companyRole} to complete the application.`)
    } finally { setBusy(false) }
  }
  // Leaving the company-documents pane: the director-filler continues to their private flow; the office-manager hands off.
  // Company sign-off complete → land on the per-applicant ROSTER hub (Company ✓ · director outstanding). A director
  // filler then nudges into their own section; an office-manager filler instead emails the named director their link.
  function afterCompanyReview() { if (companyImDirector) setAtRoster(true); else void sendToDirector() }
  // The roster nudge — the director leaves the hub to complete their own (personal) section.
  function continueOwnSection() { setAtRoster(false); advance(step + 1); autosave(step + 1) }

  // Returning applicant on the landing: re-email their resume link. Anti-enumeration — the endpoint always
  // answers ok and only sends when a matching draft exists, so the toast is deliberately non-committal.
  async function resendResumeLink(email: string) {
    const e = email.trim()
    if (!e) { toast.error("Enter the email you applied with."); return }
    try {
      await fetch("/api/applications/resend-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email: e }) })
    } catch { /* swallow — never reveal whether the email has a draft */ }
    toast.success("If a saved application exists for that email, we've emailed the link to continue.")
  }
  function loginToPrefill() { globalThis.location.href = `/login?redirect=${encodeURIComponent(`/apply/${slug}`)}` }

  function continueIdentity() {
    // Apply-only marital/spouse requirements live in maritalErrors (the shared validator doesn't know about them).
    const e = { ...validateIdentityCore("individual", form, true), ...maritalErrors(form, coApplicants) }
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("Please complete the highlighted fields."); return }
    advance(step + 1)
    autosave(step + 1)
  }

  function continueAddress() {
    const e = validateAddressStep(form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("A current address is required."); return }
    advance(step + 1)
    autosave(step + 1)
  }

  // Finances is three sub-tabs: Employment (status/employer/dependents) → Income (sources) → Expenses
  // (obligations). The application row is only CREATED leaving the last one (createApplication), so these two
  // advances just move forward (autosave is a no-op until the draft exists).
  function continueEmployment() {
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    // (Re)seed the income grid from the chosen status — but only while nothing has been typed, so changing status
    // (e.g. → unemployed) refreshes the seed instead of leaving a stale "Salary" row, without clobbering entries.
    if (allAmountsEmpty(income)) setIncome(seedIncomeFor(emp.employment_type))
    advance(step + 1)
    autosave(step + 1)
  }

  function continueIncome() {
    // Pre-seed the commitments grid (the common 2–3) on first entry to Expenses, so it opens as a grid.
    seedIfEmpty(commitments, setCommitments, seedCommitments)
    advance(step + 1)
    autosave(step + 1)
  }

  // Company-information pane (step 0 of every company flow). Juristic needs a registered name + registration number;
  // unincorporated (sole prop / partnership) just needs a trading name (the person's details come in later steps).
  function continueCompanyInfo() {
    if (isJuristicCompanyType(company.companyType)) {
      if (!company.name?.trim()) { toast.error("Add the company's registered name."); return }
      if (!company.companyReg?.trim()) { toast.error("Add the registration number."); return }
    } else if (!company.trading?.trim()) { toast.error("Add your trading name."); return }
    advance(step + 1)
    autosave(step + 1)
  }

  // UPSERT the draft (create on first save, update thereafter — keyed on the held applicationId/token). Every
  // call EXTENDS the 30-day token server-side so a long document-gathering session isn't killed mid-edit. Shared
  // by createApplication (Income→Documents) and "Save & finish later". Email is required (to send the link).
  async function saveDraft(stepToSave: number, opts?: { explicit?: boolean; silent?: boolean }): Promise<{ id: string; url: string | null; emailed: boolean } | null> {
    // On-behalf company (an office-manager filler): the PRIMARY natural person is the NAMED director
    // (coApplicants[0]), not the filler — so the office manager is never recorded as the tenant, and the resume
    // link goes to the director. Every other path's primary is the filler's own form.
    const onBehalfCompany = type === "company" && !companyImDirector && !!coApplicants[0]
    const primary = onBehalfCompany
      ? { first: coApplicants[0].firstName, last: coApplicants[0].lastName, email: coApplicants[0].email, phone: coApplicants[0].phone, id: coApplicants[0].idNumber }
      : { first: form.firstName ?? "", last: form.lastName ?? "", email: form.email ?? "", phone: form.phone ?? "", id: form.idNumber ?? "" }
    if (!primary.email) { if (!opts?.silent) { toast.error("Add your email first so we can send you a link to finish later.") } return null }
    const depA = intOrNull(dependentAdults)
    const depM = intOrNull(dependentMinors)
    const depTotal = (depA ?? 0) + (depM ?? 0)
    // School fees are entered as a commitment line but routed to the child bucket (offset by maintenance) — so the
    // declared obligations the read subtracts EXCLUDE them, and they're passed separately as school_fees.
    const schoolFeesCents = commitments.filter((r) => r.key === "school_fees").reduce((s, r) => s + rowMonthlyCents(r), 0)
    const commitMonthly = totalMonthlyCents(commitments) - schoolFeesCents
    try {
      const res = await fetch("/api/applications/save-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, applicationId, token, step: stepToSave, notify: !!opts?.explicit,
          first_name: primary.first, last_name: primary.last, email: primary.email, phone: primary.phone,
          id_type: form.idType || "sa_id", id_number: primary.id, date_of_birth: onBehalfCompany ? "" : (form.dob || ""),
          employment_type: emp.employment_type, employer_name: emp.employer, employment_start_date: emp.start_date || "",
          employment_details: {
            contract_end_date: emp.contract_end_date || null, job_title: emp.job_title || null,
            employer_contact_name: emp.employer_contact_name || null, employer_contact_detail: emp.employer_contact_detail || null,
            business_name: emp.business_name || null, business_nature: emp.business_nature || null, trading_since: emp.trading_since || null,
            registered: emp.registered || null, sars_registered: emp.sars_registered || null,
          },
          dependent_adults: depA, dependent_minors: depM, dependents: posOrNull(depTotal),
          school_fees: posOrNull(schoolFeesCents / 100),
          // income_sources is the source of truth; gross_monthly_income (rands) is the derived total — the route
          // re-derives both from income_sources and stores gross_monthly_income_cents (cents).
          gross_monthly_income: String(totalMonthlyCents(income) / 100),
          income_sources: incomeSourcesPayload(income),
          // commitments grid → expenses jsonb; their monthly sum is the declared obligations the read subtracts.
          declared_monthly_obligations: posOrNull(commitMonthly / 100),
          expenses: incomeSourcesPayload(commitments),
          addresses: form.addresses ?? null,
          applicant_type: type,
          company_info: type === "company" ? company : null,
          marital_status: form.maritalStatus || null,
          matrimonial_regime: form.matrimonialRegime || null,
          spouse_info: ((): Record<string, unknown> | null => {
            if (form.maritalStatus !== "married" || form.matrimonialRegime !== "in_community") return null
            const candidates = coApplicants.filter((c) => c.role === "co_applicant")
            const spouseIsCo = candidates.length > 0 && (form.spouseIsCoApplicant ?? true)
            // Spouse already applying → store the link (their own flow carries identity + consent); else the externals.
            if (spouseIsCo) return { isCoApplicant: true, email: candidates.length === 1 ? candidates[0].email : (form.spouseEmail ?? "") }
            return { firstName: form.spouseFirstName ?? "", lastName: form.spouseLastName ?? "", idNumber: form.spouseIdNumber ?? "", email: form.spouseEmail ?? "" }
          })(),
        }),
      })
      const json = await res.json() as { applicationId?: string; token?: string; resumeUrl?: string; emailed?: boolean; error?: string }
      if (!res.ok || !json.applicationId || !json.token) { if (!opts?.silent) { toast.error(json.error ?? "Could not save your progress.") } return null }
      setApplicationId(json.applicationId); setToken(json.token)
      // Put the resume token in the URL so a refresh / dev hot-reload rehydrates from the saved draft instead of
      // restarting (the draft is on the server; without the token in the URL the page can't find it on reload).
      try { globalThis.history?.replaceState(null, "", `?app=${json.applicationId}&token=${encodeURIComponent(json.token)}`) } catch { /* best-effort */ }
      return { id: json.applicationId, url: json.resumeUrl ?? null, emailed: !!json.emailed }
    } catch { if (!opts?.silent) { toast.error("Could not save your progress.") } return null }
  }

  // Per-step autosave: once a draft EXISTS (explicit save or the Income create), silently UPDATE it on every
  // step-advance so additional data is captured as you go — never CREATES a row on plain advance (no draft
  // spam from casual visitors), and never toasts/emails. Best-effort; the next save re-sends full state.
  function autosave(stepToSave: number) {
    if (applicationId && form.email) void saveDraft(stepToSave, { silent: true })
  }

  // Explicit "Save & finish later": persist + email the link, then surface the resume-link modal + mark saved.
  async function saveAndExit() {
    setBusy(true)
    try {
      const r = await saveDraft(step, { explicit: true })
      if (r) { setResumeLink(r.url); setEmailed(r.emailed); setSaved(true); setSaveModalOpen(true) }
    } finally { setBusy(false) }
  }

  async function createApplication() {
    // Employment status only — a R0 primary (student/dependent) applies with a guarantor whose income is captured
    // separately, so don't force an income figure here. JURISTIC company creates from the company entity (leaving
    // Company finances, before the director's employment is captured) so the employment gate doesn't apply there.
    if (type !== "company" && !emp.employment_type) { toast.error("Please select an employment status."); return }
    setBusy(true)
    try {
      // On the FIRST create, email the resume link + toast — so the way-back is discoverable proactively, not
      // hidden behind a button. Subsequent passes are silent updates.
      const firstCreate = !applicationId
      const r = await saveDraft(step + 1, firstCreate ? { explicit: true } : undefined)
      if (!r) return
      void dispatchInvites(r.id)                // fire the held at-selection invites now the application exists
      if (firstCreate) {
        setSaved(true); setResumeLink(r.url); setEmailed(r.emailed)
        toast.success(r.emailed
          ? `Progress saved — we've emailed a link to ${form.email} to finish later.`
          : "Progress saved — you can finish later.")
      }
      advance(step + 1)
    } finally {
      setBusy(false)
    }
  }

  // Send every complete-but-not-yet-invited co-applicant (id_number links them to the application). Called at
  // create (the at-selection invites) and again from the Applicants step (any added there).
  async function dispatchInvites(appId: string) {
    // The primary is the filler's form — EXCEPT on-behalf company, where coApplicants[0] (the named director) IS
    // the primary (they get the resume link via the draft email), so don't also invite them as a co-applicant.
    // Everyone else complete is invited (co-applicants, guarantors, other directors/signatories).
    const skipPrimaryDirector = type === "company" && !companyImDirector
    const pending = coApplicants.filter((c, i) => !(skipPrimaryDirector && i === 0) && !c.invited && coComplete(c))
    if (pending.length === 0) return
    for (const c of pending) {
      const res = await fetch(`/api/applications/${appId}/co-applicant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone, id_number: c.idNumber, id_type: "sa_id", role: c.role }),
      })
      if (!res.ok) toast.error(`Could not invite ${c.email}`)
    }
    setCoApplicants((prev) => prev.map((c) => coComplete(c) ? { ...c, invited: true } : c))
  }

  // Invite an applicant added from the review (affordability boost). Adds + invites + re-runs the assessment.
  async function confirmAddApplicant() {
    if (!coComplete(newCo)) { toast.error("Add the applicant's name, email and ID number."); return }
    setBusy(true)
    try {
      if (applicationId) {
        const res = await fetch(`/api/applications/${applicationId}/co-applicant`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: newCo.firstName, last_name: newCo.lastName, email: newCo.email, phone: newCo.phone, id_number: newCo.idNumber, id_type: "sa_id", role: newCo.role }),
        })
        if (!res.ok) { toast.error("Could not invite the applicant. Please try again."); return }
      }
      setCoApplicants((prev) => [...prev, { ...newCo, invited: true }])
      setNewCo(blankCo("co_applicant")); setAddApplicantOpen(false)
      toast.success(`Invited ${newCo.email} — they'll get a link to add their part. We'll recheck once they're done.`)
      await submitApplication() // re-run the read; their income counts toward affordability once they finish
    } finally { setBusy(false) }
  }

  async function uploadDoc(categoryKey: string, file: File | null, single: boolean) {
    if (!file || !applicationId) return
    const fileId = `${categoryKey}_${crypto.randomUUID().slice(0, 8)}`
    const entry: DocFile = { id: fileId, name: file.name, uploading: true, uploaded: false, storagePath: null }
    setDocFiles((prev) => ({ ...prev, [categoryKey]: single ? [entry] : [...(prev[categoryKey] ?? []), entry] }))
    const patch = (p: Partial<DocFile>) => setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, ...p } : f) }))

    // Format validation client-side (extension + MIME + magic bytes) — the same ADDENDUM_14L gate the agent
    // route uses; the applicant uploads straight to Storage, so enforce it here. Encrypted PDFs are NOT blocked:
    // the server pipeline decrypts empty-password files (the common bank-statement case) before extraction.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = validateUpload(file.name, file.type, bytes)
    if (!check.valid) { patch({ uploading: false, error: check.userMessage ?? "File not accepted." }); toast.error(check.userMessage?.split("\n")[0] ?? "File not accepted."); return }

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const path = `applications/${orgId}/${applicationId}/${single ? categoryKey : fileId}.${ext}`
      const { error: upErr } = await supabase.storage.from("application-docs").upload(path, file, { upsert: true })
      if (upErr) throw upErr
      let detection: string | null = null
      try {
        const res = await fetch(`/api/applications/${applicationId}/detect-document`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, docKey: categoryKey }),
        })
        if (res.ok) {
          detection = ((await res.json()) as { summary?: string }).summary ?? null
        } else if (res.status === 422) {
          // A genuinely password-locked PDF — remove the just-uploaded file and tell the applicant to re-save it.
          const b = await res.json().catch(() => ({})) as { message?: string }
          const msg = b.message ?? "This file is password-protected — please upload an unprotected version."
          try { await supabase.storage.from("application-docs").remove([path]) } catch { /* best-effort */ }
          patch({ uploading: false, error: msg })
          toast.error(msg)
          return
        }
      } catch { /* detection non-fatal */ }
      patch({ uploading: false, uploaded: true, storagePath: path, detection })
    } catch (err) {
      patch({ uploading: false, error: err instanceof Error ? err.message : "Upload failed" })
    }
  }

  async function removeDoc(categoryKey: string, fileId: string) {
    const f = (docFiles[categoryKey] ?? []).find((x) => x.id === fileId)
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).filter((x) => x.id !== fileId) }))
    // Delete from Storage too — the /screen pipeline enumerates the whole prefix, so a removed file must go.
    if (f?.storagePath) { try { await createClient().storage.from("application-docs").remove([f.storagePath]) } catch { /* best-effort */ } }
  }
  function renameDoc(categoryKey: string, fileId: string, name: string) {
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, name } : f) }))
  }

  async function finishDocuments() {
    if (!applicationId) return
    setBusy(true)
    try {
      // Back-compat: store the first main bank-statement path. The real extraction is the /screen pipeline,
      // which enumerates EVERY uploaded file — so multi-file categories flow through with no extra wiring.
      const bankPath = (docFiles["bank_main"] ?? []).find((f) => f.uploaded)?.storagePath ?? null
      await createClient().from("applications").update({ bank_statement_path: bankPath, stage1_status: "documents_submitted" }).eq("id", applicationId)
      advance(step + 1)
      autosave(step + 1) // persist draft_step so a refresh/resume lands back on the review, not Documents
    } finally {
      setBusy(false)
    }
  }

  // Documents is two sub-tabs: Required (the gating core) → Optional (strengtheners). Required→Optional just
  // advances once the required docs are satisfied; finishDocuments runs leaving Optional → Applicants.
  function continueDocsRequired() { advance(step + 1); autosave(step + 1) }

  /** Amend the application (add applicant / upload docs / edit details) → re-enter that step; the user
   *  re-submits to run a fresh screening iteration (the 14M self-improvement loop). */
  function applyAmend(toStep: number) { setScreeningStatus("idle"); setAssessment(null); setStep(toStep) }
  function amendAt(toStep: number) {
    // Editing PERSONAL details (not documents/company) in a still-locked resumed session → "verify it's you" first.
    if (!amendUnlocked && PERSONAL_EDIT_KEYS.has(nav.paneMeta[toStep]?.key ?? "")) { setAmendGateStep(toStep); return }
    applyAmend(toStep)
  }

  /** Run the Step-1 FREE assessment (zero-AI, instant) and show the result. NO deep scan, NO poll — the deep
   *  scan runs later, at the agent's shortlist step. The assessment can be re-run freely (it's free). */
  async function submitApplication() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; error?: string; code?: string; freeAssessment?: FreeAssessmentResult }
      if (!res.ok || !json.ok || !json.freeAssessment) {
        // If the email changed since verifying, the server clears the gate — re-show "Verify your email".
        if (json.code === "email_unverified") setEmailVerified(false)
        toast.error(json.error ?? "Could not run your assessment."); return
      }
      setAssessment(json.freeAssessment); setScreeningStatus("done")
    } catch {
      toast.error("Could not run your assessment.")
    } finally {
      setBusy(false)
    }
  }

  const { nav, personalStep } = resolveFlow(type, company.companyType, step)
  // The PERSON's docs (owner/director) are always personal/self-employed (not the company set). The juristic company
  // has a SEPARATE company-docs pane (CIPC/AFS/bank) — companyDocCategories.
  const docApplicantType = type === "company" ? "individual" : type
  const docCategories = deriveDocCategories(incomeKeys(income), emp.employment_type, form.idType, docApplicantType)
  const companyDocCategories = deriveDocCategories(new Set<string>(), "", form.idType, "company")
  // A required doc is satisfied when uploaded, OR — if it offers an escape ("I don't have a payslip") — when the
  // applicant takes that escape. ID + bank statements have no escape, so they're the true hard uploads.
  const docsReady = docCategories.filter((c) => c.required).every((c) => (docFiles[c.key] ?? []).some((f) => f.uploaded) || (!!c.escapeLabel && !!docEscape[c.key]))
    && !Object.values(docFiles).flat().some((f) => f.uploading)
  const companyOk = type !== "company" || Boolean(company.companyType)
  // Submit gate: every applicant "green" — primary is implicit, each co-applicant has name+email+id (or is
  // already invited), and a company application has its type captured.
  const applicantsGreen = companyOk && coApplicants.every((c) => c.invited || coComplete(c))
  // Email gate satisfied if they verified by OTP OR they're the logged-in owner of this email (already confirmed).
  const emailGateSatisfied = emailVerified || (!!verifiedEmail && !!form.email && form.email.toLowerCase() === verifiedEmail.toLowerCase())
  const companyRosterPersons = buildCompanyRosterPersons(form, coApplicants, companyRole, companyImDirector)
  // The footer ALWAYS shows the pre-selection disclaimer — the save confirmation lives in the modal, not here.
  const disclaimer = "Pre-selection only — affordability and shortlisting. No credit check or bureau enquiry runs at this stage — only after you submit and give explicit consent."
  // -mr-5 pr-5: bleed the scroll body 20px into the panel's 40px side padding and pad the content back, so the
  // vertical scrollbar lives in that gutter (between content and border) instead of squashing the wording.
  const scrollCls = "flex-1 py-3 -mr-5 pr-5 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"
  // Two-level nav state: "Apply as" is the landing (type + parties + returning); the form panes (step 0–7) group
  // into Personal details / Finances / Documents / Application review via PANE_META. inWizard = past the landing.
  const inWizard = begun
  // soleProp / juristic / nav / companyPaneCount / personalStep come from resolveFlow (above, near docCategories).
  const activeKey = inWizard ? nav.paneMeta[step]?.key : undefined // the active pane's key drives render + next dispatch
  const activeGroup = inWizard ? nav.paneMeta[step].group : "Apply as"
  // The panel header reads "Group · sub" in the wizard and "Apply to · {unit}" on the landing.
  const headerTitle = inWizard ? activeGroup : "Apply to"
  const headerSub = inWizard ? nav.paneMeta[step].sub : (listingTitle ?? "this home")
  const applyAsDesc = type ? `${TYPE_LABEL[type]} · ${leaseType}` : "Choose how you apply"
  const navStates = computeStepStates(nav, { activeGroup, step, maxReached, inWizard, typePicked: type !== null, hasApplication: !!applicationId, applyAsDesc })
  const onNav = (t: number | "apply-as") => { if (t === "apply-as") setBegun(false); else navTo(t) }
  const advanceStep = () => { advance(step + 1); autosave(step + 1) } // plain "Next" for panes with no validation (co-address)
  // The current step's forward action (header "Next →"). Resolved by a module helper to keep this component under
  // the complexity gate. Review has NO header action (its buttons live in the page body) → returns null there.
  const navNext = resolveNavNext({
    inWizard, atRoster, activeKey, companyImDirector, companyRole, personalStep, docsReady, busy,
    continueCompanyInfo, advanceStep, afterCompanyReview, createApplication, companyConsent, emailGateSatisfied,
    continueIdentity, continueAddress, continueEmployment, continueIncome, continueDocsRequired, finishDocuments,
  })
  const showBackBtn = inWizard
  const showSaveBtn = inWizard && !!form.email && personalStep <= LAST_DATA_STEP && screeningStatus === "idle"
  // The active form pane for the current step — extracted from the JSX to keep the component under the complexity
  // gate. Works for personal AND the sole-prop machine (co-info at step 0, then the personal panes via personalStep).
  function renderFormPane() {
    if (!type) return null // narrows ApplicantType for the panes below (only ever rendered when type is set)
    // Company ENTITY panes (sole prop has only co-info; juristic has info · address · finances · documents).
    if (activeKey === "co-info") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={0} />
    if (activeKey === "co-address") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={1} />
    if (activeKey === "co-finances") return <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={2} />
    if (activeKey === "co-docs") return <StepDocuments tab="required" categories={companyDocCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (activeKey === "co-review") return <StepCompanyReview company={company} applicationId={applicationId} token={token} emailVerified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} consent={companyConsent} setConsent={setCompanyConsent} imDirector={companyImDirector} companyRole={companyRole} />
    if (personalStep === 0) return <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} coApplicants={coApplicants} />
    if (personalStep === 1) return <StepAddress form={form} set={set} errors={errors} />
    if (personalStep === 2) return <StepEmployment emp={emp} setEmp={setEmp} />
    if (personalStep === 3) return <StepIncome income={income} setIncome={setIncome} variable={SELF_EMPLOYED_TYPES.includes(emp.employment_type) || emp.employment_type === "commission"} />
    if (personalStep === STEP_EXPENSES) return <StepExpenses dependentAdults={dependentAdults} setDependentAdults={setDependentAdults} dependentMinors={dependentMinors} setDependentMinors={setDependentMinors} commitments={commitments} setCommitments={setCommitments} />
    if (personalStep === STEP_DOCUMENTS) return <StepDocuments tab="required" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (personalStep === STEP_DOCS_OPTIONAL) return <StepDocuments tab="optional" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />
    if (personalStep === STEP_REVIEW) return <StepSubmit form={form} emp={emp} income={income} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} coApplicants={coApplicants} applicantsGreen={applicantsGreen} screeningStatus={screeningStatus} assessment={assessment} companyName={type === "company" ? (company.name || company.trading || "The company") : undefined} onAmend={amendAt} onRerun={submitApplication} onContinue={submitApplication} onAddApplicant={() => setAddApplicantOpen(true)} applicationId={applicationId} token={token} emailVerified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} />
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
          /* Rail card FILLS the column (fixed outer height → expanding the accordion never shifts the layout). Its
             BODY scrolls, so on a short viewport the steps stay reachable instead of overflowing out of view. */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
            <div className="flex shrink-0 items-center border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
                Your application
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2"><StepRail model={nav} states={navStates} step={step} maxReached={maxReached} onNav={onNav} onJumpStep={navTo} /></div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{listingCard}</div>
        )}
        {/* Agent card — fixed, anchored below the side column. */}
        {agentCard && <div className="mt-4 shrink-0">{agentCard}</div>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0" style={{ maxWidth: "none", width: "100%" }}>

        {/* Mobile/short: horizontal step bar + sub-tabs (on desktop the rail handles both) */}
        <div className="[@media(min-width:1024px)_and_(min-height:700px)]:hidden">
          <StepBar states={navStates} onNav={onNav} />
          {inWizard && <SubTabs model={nav} activeGroup={activeGroup} step={step} maxReached={maxReached} onJumpStep={navTo} />}
        </div>

        {/* Panel header — mirrors the rail's "Your application" header (amber tick + step · section) so the rule
            continues across the nav and the panel. Shows on the landing too ("Apply as · Pre-selection"). */}
        {/* The side column differs by state — landing = listing DetailCard, wizard = the step-rail card — and
            their headers sit at slightly different heights, so the panel header needs a per-state top offset. */}
        <div className={`mb-3 flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-2.5 ${begun ? "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-6" : "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-[18px]"}`}>
            <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--ink)]">
              <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
              <span className="truncate">{headerTitle}<span className="font-normal text-[var(--ink-mute)]"> · {headerSub}</span></span>
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {showBackBtn && (
                <ActionButton tone="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={goBack} disabled={busy || (step === 0 && !!applicationId)}>Back</ActionButton>
              )}
              {navNext && (
                <ActionButton tone={navNext.primary ? "primary" : "secondary"} size="sm" onClick={navNext.onClick} disabled={busy || navNext.disabled} className="whitespace-nowrap">
                  {navNext.primary ? navNext.label : <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{navNext.label} <ArrowRight className="size-4" /></span>}
                </ActionButton>
              )}
              {/* Two distinct things: a QUIET passive status (auto-save reassurance) + a LABELLED action that
                  actually emails the resume link (the real way back). Don't let the tick masquerade as the action. */}
              {saved && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--ink-mute)]" title="Your progress is saved on our servers">
                  <CheckCircle2 className="size-3.5" /> Saved
                </span>
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

        {/* "Sent to director" — an office-manager filler handed the company off: the roster shows Company ✓ + the
            director outstanding (emailed their link). Nothing more for the office manager to do. */}
        {companySentToDirector && (
          <div className={scrollCls}>
            <ApplicantRoster
              persons={companyRosterPersons}
              companyCard={<CompanyCard name={company.name || company.trading || "The company"} status="complete" />}
              allGreen={false} outstandingCount={companyRosterPersons.length} onReview={() => undefined}
              waitingNote={<>We&apos;ve emailed {coApplicants[0]?.email ? <strong className="text-[var(--ink)]">{coApplicants[0].email}</strong> : `the ${companyRole}`} a secure link to complete their personal application. You can close this page.</>}
            />
          </div>
        )}

        {/* Per-applicant ROSTER hub — after the company sign-off, the director nudges into their own section. */}
        {begun && atRoster && !companySentToDirector && (
          <div className={scrollCls}>
            <ApplicantRoster
              persons={companyRosterPersons}
              companyCard={<CompanyCard name={company.name || company.trading || "The company"} status="complete" />}
              allGreen={false} outstandingCount={companyRosterPersons.length} onReview={() => undefined}
              onContinueOwn={continueOwnSection} continueLabel="Continue with your application"
            />
          </div>
        )}

        {begun && type !== null && !companySentToDirector && !atRoster && (
          <>
            <div className={scrollCls}>{renderFormPane()}</div>
          </>
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

      {/* Identity re-verify gate — before editing personal details from a resumed (shared-link) session, prove it's
          you with a fresh code (reverify forces one even if the email was verified at sign-off). */}
      {amendGateStep !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setAmendGateStep(null)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--ink)]">Verify it&apos;s you</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">Anyone with this link can view the application, so before you edit personal details we&apos;ll send a code to your email to confirm it&apos;s you.</p>
            <div className="mt-3">
              <VerifyEmail applicationId={applicationId} token={token} email={form.email} verified={false} reverify
                onVerified={() => { setAmendUnlocked(true); applyAmend(amendGateStep); setAmendGateStep(null) }} />
            </div>
            <div className="mt-4 flex justify-end"><ActionButton tone="secondary" onClick={() => setAmendGateStep(null)} disabled={busy}>Cancel</ActionButton></div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}
