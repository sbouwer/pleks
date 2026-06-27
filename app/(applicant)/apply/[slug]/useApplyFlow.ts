/**
 * app/(applicant)/apply/[slug]/useApplyFlow.ts — the apply wizard state machine (state + handlers + derived)
 *
 * Notes:  Extracted verbatim from applyOrchestrator (14Q increment 0b, CD ordering D) so the wizard's state + flow
 *         handlers live in ONE testable hook and StepPanel is a thin render shell. Behaviour-preserving: all state +
 *         handlers move together into a single hook scope, so every closure still closes over the same state — no
 *         split, no staleness. The pure save-draft payload lives in applySaveDraft; the nav MODEL in applyNav; the
 *         flow-shape helpers (resolveFlow/resolveRail/resolveNavNext/maritalErrors) stay module-level here to keep the
 *         hook under the complexity gate. The view-state rewrite (ApplyView) builds on this hook.
 */
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useBegun } from "./applyChrome"
import { type CompanyInfo, isJuristicCompanyType } from "./applyCompany"
import {
  type ApplicantType, type CoRole, type ScreeningStatus, type SetFn, type DocFile, type CoApplicant, type Emp, type IncomePeriod, type IncomeRow,
  STEP_EXPENSES, STEP_DOCUMENTS, STEP_DOCS_OPTIONAL, STEP_REVIEW, LAST_DATA_STEP,
  INCOME_LABEL, seedIncomeFor, COMMITMENT_LABEL, seedCommitments,
  allAmountsEmpty, seedIfEmpty, numStr, moneyCents, incomeKeys, blankCo,
} from "./applyDomain"
import { deriveDocCategories, categoryForFilename } from "@/lib/applications/docCategories"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors,
} from "@/lib/parties/partyValidation"
import { isValidEmail, cipcRegError, checkPhone } from "@/lib/validation/contact"
import { assembleSaveDraftPayload, resolvePrimary } from "./applySaveDraft"
import { buildRosterPersons, type RosterPerson } from "./applyRoster"
import type { StatusMenuCompany, StatusMenuPerson, CardStatus } from "./applyStatusMenu"
import { PERSONAL_NAV, SOLEPROP_NAV, PTY_NAV, PTY_COMPANY_NAV, PTY_DIRECTOR_NAV, PTY_COMPANY_PANES, computeStepStates, type NavModel } from "./applyNav"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"

export const TYPE_LABEL: Record<ApplicantType, string> = { individual: "Individual", couple: "Couple", company: "Company", guarantor: "With a guarantor" }

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
const coComplete = (c: CoApplicant) => Boolean(c.firstName.trim() && c.email.trim() && isValidEmail(c.email) && c.idNumber.trim())

/** Pane keys that hold PERSONAL details — editing these in a resumed (shared-link) session needs an identity re-verify. */
const PERSONAL_EDIT_KEYS = new Set(["personal", "address", "employment", "income", "expenses"])

/** The company roster's person cards — the director(s), all "outstanding" at the hub (the company section is signed
 *  off; their own personal sections aren't done yet). A director filler (You) leads the list; an office-manager
 *  filler isn't a party, so only the named directors (coApplicants) show. */
function buildCompanyRosterPersons(form: PartyFormState, coApplicants: CoApplicant[], companyRole: string, imDirector: boolean): RosterPerson[] {
  // The sign-off hub: everyone is still "outstanding" (the company card carries the ✓). Shared builder (#3).
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return buildRosterPersons(form, coApplicants, { statusAt: () => "outstanding", fillerRole: cap(companyRole), coRole: (c) => cap(c.designation ?? "director"), includeFiller: imDirector })
}

/** A hub card's 3-state status from its done/started flags (avoids a nested ternary at each call site). */
function cardStatusOf(done: boolean, started: boolean): CardStatus {
  if (done) return "completed"
  return started ? "in_progress" : "not_started"
}

/** The "Your application status" hub cards (ADDENDUM_14Q increment 2). The company card carries its own progress;
 *  the filler's self card is openable; co-applicants are status-only (they complete via their own link). Pure so the
 *  card/status/credential mapping is unit-testable. */
export function buildStatusMenuData(o: Readonly<{
  type: ApplicantType | null; isJuristic: boolean
  companyName: string; companyStarted: boolean; companySignedOff: boolean
  form: PartyFormState; coApplicants: ReadonlyArray<CoApplicant>; companyRole: string; imDirector: boolean
  selfSectionDone: boolean; selfStarted: boolean
}>): { company: StatusMenuCompany | null; persons: StatusMenuPerson[] } {
  const name = (f?: string | null, l?: string | null, fb = "Applicant") => [f, l].filter(Boolean).join(" ") || fb
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  // Company card only for a juristic company (the only flow that applies THROUGH an entity).
  const company: StatusMenuCompany | null = o.isJuristic ? { name: o.companyName, status: cardStatusOf(o.companySignedOff, o.companyStarted), canOpen: true } : null
  const persons: StatusMenuPerson[] = []
  // The filler's own card. A juristic office-manager (not a director) has no personal card; everyone else does.
  const includeSelf = o.isJuristic ? o.imDirector : true
  if (includeSelf) {
    const selfRole = o.isJuristic ? cap(o.companyRole) : "Applicant"
    persons.push({ id: "self", name: name(o.form.firstName, o.form.lastName, "You"), roleLabel: selfRole, status: cardStatusOf(o.selfSectionDone, o.selfStarted), canOpen: true })
  }
  o.coApplicants.forEach((c, i) => {
    const role = coRoleLabel(o.type, c, cap)
    persons.push({ id: `co_${i}`, name: name(c.firstName, c.lastName, c.email || "Applicant"), roleLabel: role, status: "not_started", canOpen: false, statusOnlyNote: `${role} — invited, completes via their own link` })
  })
  return { company, persons }
}
/** A co-applicant card's role label by flow type (company → their designation; guarantor → Guarantor; couple → Co-applicant). */
function coRoleLabel(type: ApplicantType | null, c: CoApplicant, cap: (s: string) => string): string {
  if (type === "company") return cap(c.designation ?? "director")
  if (type === "guarantor") return "Guarantor"
  return "Co-applicant"
}

/** Flow selection — which step machine + offset for the applicant/company type (module-level to keep the hook
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

/** The RAIL display is phase-scoped (the LOCKED roster model): a juristic company shows ONLY its company section
 *  during the company phase (and at the roster hub), then ONLY the director's own section once past the sign-off.
 *  The underlying `step`/`nav` machine is untouched — this just picks which rail to draw + the offset to map it. */
function resolveRail(juristic: boolean, nav: NavModel, step: number, companyPaneCount: number, maxReached: number): { railNav: NavModel; railOffset: number; railStep: number; railMaxReached: number } {
  const directorPhase = juristic && step >= companyPaneCount
  const railOffset = directorPhase ? companyPaneCount : 0
  let railNav = nav
  if (juristic) railNav = directorPhase ? PTY_DIRECTOR_NAV : PTY_COMPANY_NAV
  return { railNav, railOffset, railStep: step - railOffset, railMaxReached: Math.max(0, maxReached - railOffset) }
}

/** Reuse what's already declared about the company when seeding the filler's employment (fills EMPTIES only): a
 *  juristic director is EMPLOYED by the company as a "Director"; an unincorporated owner (sole prop / partnership) is
 *  SELF-EMPLOYED and their business IS the trading name. ONE place so the two flows can't drift apart. */
function prefillEmploymentFromCompany(company: CompanyInfo, e: Emp): Emp {
  if (isJuristicCompanyType(company.companyType)) {
    return { ...e, employment_type: e.employment_type || "permanent", employer: e.employer || company.name || company.trading || "", job_title: e.job_title || "Director" }
  }
  return {
    ...e,
    employment_type: e.employment_type || "self_employed",
    business_name: e.business_name || company.trading || "",
    business_nature: e.business_nature || company.nature || "",
    registered: e.registered || (company.companyType === "sole_prop" ? "sole_prop" : e.registered),
  }
}

type NavNext = { label: string; onClick: () => void; disabled?: boolean; primary?: boolean } | null
/** The header forward-action for the current step — extracted from the hook to keep it under the complexity
 *  gate. Company entity panes dispatch by `activeKey`; the personal/director panes via `personalStep`. */
function resolveNavNext(o: Readonly<{
  inWizard: boolean; atRoster: boolean; activeKey: string | undefined; companyImDirector: boolean; companyRole: string
  personalStep: number; docsReady: boolean; busy: boolean
  continueCompanyInfo: () => void; advanceStep: () => void; afterCompanyReview: () => void; createApplication: () => void
  continueCompanyFinances: () => void
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
  continueCompanyFinances: () => void
}>): NavNext {
  if (o.activeKey === "co-info") return { label: "Next", onClick: o.continueCompanyInfo }
  if (o.activeKey === "co-address") return { label: "Next", onClick: o.advanceStep }
  if (o.activeKey === "co-finances") return { label: "Next", onClick: o.continueCompanyFinances } // completeness gate → create
  if (o.activeKey === "co-docs") return { label: "Next", onClick: o.advanceStep }
  if (o.activeKey === "co-docs-opt") return { label: "Next", onClick: o.advanceStep }
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
function seedDocFiles(income: IncomeRow[], employmentType: string, docPaths: { name: string; storagePath: string }[], idType?: string | null, applicantType?: ApplicantType | null, companyType?: string | null): Record<string, DocFile[]> {
  const cats = deriveDocCategories(incomeKeys(income), employmentType, idType, applicantType, companyType)
  const out: Record<string, DocFile[]> = {}
  for (const p of docPaths) {
    const cat = categoryForFilename(p.name, cats)
    out[cat] = [...(out[cat] ?? []), { id: `resumed_${p.name}`, name: "Uploaded document", uploading: false, uploaded: true, storagePath: p.storagePath }]
  }
  return out
}

export interface UseApplyFlowProps {
  slug: string; orgId: string; listingTitle?: string; leaseType: "residential" | "commercial"; askingRentCents: number
  prefill?: Partial<PartyFormState> | null
  resume?: ResumeState | null
  verifiedEmail?: string | null
}

/** The apply wizard state machine. Returns all state, setters, handlers and derived values the render shell needs. */
export function useApplyFlow({ slug, orgId, listingTitle, leaseType, askingRentCents, prefill, resume, verifiedEmail }: UseApplyFlowProps) {
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
  const [saved, setSaved] = useState<boolean>(!!resume) // an application has been created (drives the Save button label)
  // TRANSIENT "Saved ✓" chip — flashSaved() bumps a tick on each real save; the effect shows the chip for 2.5s then
  // hides it (cleanup clears a prior timer on a re-save). Effect-driven so we never touch a ref during render.
  const [justSaved, setJustSaved] = useState(false)
  const [saveTick, setSaveTick] = useState(0)
  const flashSaved = () => setSaveTick((t) => t + 1)
  useEffect(() => {
    if (saveTick === 0) return
    setJustSaved(true)
    const id = setTimeout(() => setJustSaved(false), 2500)
    return () => clearTimeout(id)
  }, [saveTick])
  const [resumeLink, setResumeLink] = useState<string | null>(null)
  const [emailed, setEmailed] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false) // guards the autosave create-on-demand race (one at a time)
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
  // Only a JURISTIC company applies through directors and gets the status-menu hub. Sole prop / partnership are
  // unincorporated → they run the linear personal flow (a single applicant), no menu.
  const isJuristicCompany = type === "company" && isJuristicCompanyType(company.companyType)
  // "Add applicant" from the review (when affordability is short) — invite a co-applicant after the app exists.
  const [addApplicantOpen, setAddApplicantOpen] = useState(false)
  const [newCo, setNewCo] = useState<CoApplicant>(blankCo("co_applicant"))
  // "Begun" = past the "Apply as" landing and into the form panes. Lifted to a shared context (applyChrome) so the
  // top-header unit strip can render only once in the application. Resuming a saved draft starts already begun;
  // clicking "Apply as" in the rail re-opens the landing (begun→false) with the chosen type preserved.
  const { begun, setBegun } = useBegun()
  const [docFiles, setDocFiles] = useState<Record<string, DocFile[]>>(resume && resumedIncome ? seedDocFiles(resumedIncome, resume.emp.employment_type, resume.docPaths, resume.form?.idType, resume.applicantType ?? inferType(resume.coApplicants), resume.company?.companyType) : {})
  const [docEscape, setDocEscape] = useState<Record<string, boolean>>({})
  const [consent, setConsent] = useState(false)
  const [companyConsent, setCompanyConsent] = useState(false) // the COMPANY applicant's sign-off consent (co-review)
  // The "Your application status" menu is the hub for a COMPANY application (ADDENDUM_14Q): you arrive here after
  // apply-as, open a card (company / your own section), and return here on save/sign-off. A resumed company draft
  // lands on the menu too. (Couple/guarantor/individual still run linearly — their menu is a later increment.)
  const resumeCompany = !!resume && resume.applicantType === "company" && isJuristicCompanyType(resume.company?.companyType ?? "")
  const resumeStep = resume?.step ?? 0
  const [atRoster, setAtRoster] = useState<boolean>(resumeCompany)
  const [companyStarted, setCompanyStarted] = useState<boolean>(resumeCompany && resumeStep > 0)
  const [companySignedOff, setCompanySignedOff] = useState<boolean>(resumeCompany && resumeStep >= PTY_COMPANY_PANES)
  const [selfSectionDone, setSelfSectionDone] = useState(false)
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
    setAtRoster(false) // navigating into a pane leaves the status-menu hub
    setStep(to)
  }

  // Pick an application type on the landing (no navigation — the landing stays until "Begin"). Co-applicant rows
  // are seeded for multi-party types so the inline capture has a first row; switching to individual clears them.
  function selectType(t: ApplicantType) {
    setType(t)
    // The card already says who they are, so force every row's role to match it (no per-row choice). Company
    // applies THROUGH its director(s), so capture them like couple (role co_applicant = the signatory on its behalf).
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
      if (companyImDirector && !(form.firstName?.trim() && isValidEmail(form.email) && form.idNumber?.trim())) {
        toast.error(`Add your name, a valid email and ID number as the ${companyRole}.`); return
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
    setAtRoster(true) // EVERY flow lands on the "Your application status" hub (ADDENDUM_14Q universal landing)
  }

  function goBack() {
    if (atRoster) { setBegun(false); return } // the status hub is the home → Back exits to the landing (Apply as)
    // A sub-flow's first step returns to the hub (never the landing, never another applicant). For a juristic company
    // the director-section start (step === companyPaneCount) also returns to the hub.
    if (step === 0) { setAtRoster(true); return }
    if (isJuristicCompany && step === companyPaneCount) { setAtRoster(true); return }
    navTo(step - 1)
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
  function afterCompanyReview() { if (companyImDirector) { setCompanySignedOff(true); setAtRoster(true) } else void sendToDirector() }
  // Open a card from the status-menu hub. The company card → the company section; "self" → the director's own
  // (personal) section, reusing what we know about the company (shared prefill, #1); "review" → the application
  // Review & Submit. navTo clears the hub flag + sets the step.
  function onOpenCard(id: string) {
    if (id === "company") { setCompanyStarted(true); navTo(0) } // juristic only — opens the company section
    else if (id === "self") {
      // The filler's own section. For a juristic company the director's personal flow starts after the company panes
      // and reuses what we know about the company (prefill, #1); every other flow's section starts at step 0.
      if (isJuristicCompany) { setEmp((e) => prefillEmploymentFromCompany(company, e)); navTo(companyPaneCount) }
      else navTo(0)
    }
    else if (id === "review") { const t = companyPaneCount + STEP_REVIEW; setMaxReached((m) => Math.max(m, t)); navTo(t) }
  }
  function backToMenu() { setAtRoster(true) } // the persistent "← All applicants" return

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
      // CIPC: format + registration year + entity-type code must match the company type. Trusts use a free-form
      // Master's reference, so skip the format check for them.
      if (company.companyType !== "trust") {
        const regErr = cipcRegError(company.companyReg, true, company.companyType)
        if (regErr) { toast.error(regErr); return }
      }
    } else {
      if (!company.trading?.trim()) { toast.error("Add your trading name."); return }
      // Unincorporated: reuse the business info to seed the owner's (self-employed) employment (shared helper, #1).
      setEmp((e) => prefillEmploymentFromCompany(company, e))
    }
    // Company contact details are optional, but if given must be valid (same SSOT as everywhere else).
    if (company.companyEmail?.trim() && !isValidEmail(company.companyEmail)) { toast.error("Enter a valid company email address."); return }
    if (company.companyPhone?.trim()) { const c = checkPhone(company.companyPhone); if (!c.valid) { toast.error(c.reason ?? "Enter a valid company phone number."); return } }
    advance(step + 1)
    autosave(step + 1) // autosave creates the draft on demand (we have the filler's email) → persists from here on
  }

  // UPSERT the draft (create on first save, update thereafter — keyed on the held applicationId/token). Every
  // call EXTENDS the 30-day token server-side so a long document-gathering session isn't killed mid-edit. Shared
  // by createApplication (Income→Documents) and "Save & finish later". Email is required (to send the link).
  async function saveDraft(stepToSave: number, opts?: { explicit?: boolean; silent?: boolean }): Promise<{ id: string; url: string | null; emailed: boolean } | null> {
    // Primary-person resolution + the whole request body are pure (applySaveDraft) — the email guard, network call
    // and state writes stay here. On-behalf company → the named director is primary (see resolvePrimary).
    const primary = resolvePrimary(type, companyImDirector, coApplicants, form)
    if (!primary.email) { if (!opts?.silent) { toast.error("Add your email first so we can send you a link to finish later.") } return null }
    try {
      const res = await fetch("/api/applications/save-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assembleSaveDraftPayload({
          slug, applicationId, token, stepToSave, notify: !!opts?.explicit,
          type, companyImDirector, coApplicants, form, emp, dependentAdults, dependentMinors, income, commitments, company,
        })),
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

  // Per-sub-step autosave (universal — individuals AND companies): silently persist on EVERY step-advance so nothing
  // is lost as you go. CREATES the draft on demand the first time (as soon as we have an email), then UPDATES it —
  // so progress is recoverable from the very first step, not only after some later create point. Never toasts/emails.
  function autosave(stepToSave: number) {
    if (!applicationId && (!form.email || creatingDraft)) return // need an email to create; one create at a time
    const firstCreate = !applicationId
    if (firstCreate) setCreatingDraft(true)
    // Always autosave each sub-step (data safety) — but only FLASH the "Saved" chip when a whole STEP GROUP was just
    // completed (the group changes between the pane left and the pane entered), so the pill tracks visible steps.
    const crossedGroup = nav.paneMeta[stepToSave - 1]?.group !== nav.paneMeta[stepToSave]?.group
    void saveDraft(stepToSave, { silent: true }).then((r) => {
      if (firstCreate) { setCreatingDraft(false); if (r) setSaved(true) }
      if (r && crossedGroup) flashSaved()
    })
  }

  // Explicit "Save & finish later": persist + email the link, then surface the resume-link modal + mark saved.
  async function saveAndExit() {
    setBusy(true)
    try {
      const r = await saveDraft(step, { explicit: true })
      if (r) { setResumeLink(r.url); setEmailed(r.emailed); setSaved(true); setSaveModalOpen(true) }
    } finally { setBusy(false) }
  }

  // Company finances completeness gate (Company finances → Documents): the surplus is meaningless without income, so
  // require ≥1 money-in line with an amount (money-out may legitimately be empty for a debt-free company).
  function continueCompanyFinances() {
    const hasIncome = (company.ledgerIn ?? []).some((r) => moneyCents(r.amount) > 0)
    if (!hasIncome) { toast.error("Add at least one money-in line with an amount."); return }
    void createApplication()
  }

  // The income/expenses section-finish (Income/Expenses → Documents). The draft already exists by now — autosave
  // CREATES it on the first step (see autosave); this is the gate + the point we fire the held co-applicant invites.
  // The saveDraft is an upsert, so it still creates as a fallback if autosave somehow hasn't.
  async function createApplication() {
    // Employment status only — a R0 primary (student/dependent) applies with a guarantor whose income is captured
    // separately, so don't force an income figure here. JURISTIC company skips it (the director's employment comes
    // later, in their own section).
    if (type !== "company" && !emp.employment_type) { toast.error("Please select an employment status."); return }
    setBusy(true)
    try {
      const r = await saveDraft(step + 1)
      if (!r) return
      void dispatchInvites(r.id)   // fire the held at-selection invites now the application exists
      if (!saved) setSaved(true)   // autosave normally flips this on first create; belt-and-braces
      flashSaved()                 // Income/Expenses → Documents is a step-group boundary → confirm the save
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
      // The applicant's own section is done → back to the status hub (their self card flips to Completed). The
      // application Review & Submit lives on the hub now (every flow), not at the end of a linear walk.
      setSelfSectionDone(true)
      setAtRoster(true)
      autosave(step)
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

  const { nav, personalStep, juristic, companyPaneCount } = resolveFlow(type, company.companyType, step)
  // The PERSON's docs (owner/director) are always personal/self-employed (not the company set). The juristic company
  // has a SEPARATE company-docs pane (CIPC/AFS/bank) — companyDocCategories.
  const docApplicantType = type === "company" ? "individual" : type
  // Personal docs: sole prop runs the self-employed set (docApplicantType is "individual"); pass sars_registered so
  // an un-registered self-employed isn't asked for the SARS doc. The juristic co-docs pane passes the companyType so
  // the company set (CIPC/AFS/director's ID) is used.
  const docCategories = deriveDocCategories(incomeKeys(income), emp.employment_type, form.idType, docApplicantType, company.companyType, emp.sars_registered)
  const companyDocCategories = deriveDocCategories(new Set<string>(), "", form.idType, "company", company.companyType, undefined, company.companyReg)
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
  // The "Your application status" hub cards (ADDENDUM_14Q increment 2 — company applications). selfStarted = the
  // director has entered their own (post-company) section at least once.
  const selfStart = isJuristicCompany ? companyPaneCount : 0
  const selfStarted = maxReached > selfStart
  const { company: statusMenuCompany, persons: statusMenuPersons } = buildStatusMenuData({
    type, isJuristic: isJuristicCompany, companyName: company.name || company.trading || "The company",
    companyStarted, companySignedOff, form, coApplicants, companyRole, imDirector: companyImDirector, selfSectionDone, selfStarted,
  })
  // Multi-party = the hub lists more than the filler (a juristic company, or any co-applicant/guarantor).
  const isMultiParty = isJuristicCompany || coApplicants.length > 0
  // The footer ALWAYS shows the pre-selection disclaimer — the save confirmation lives in the modal, not here.
  const disclaimer = "Pre-selection only — affordability and shortlisting. No credit check or bureau enquiry runs at this stage — only after you submit and give explicit consent."
  // -mr-5 pr-5: bleed the scroll body 20px into the panel's 40px side padding and pad the content back, so the
  // vertical scrollbar lives in that gutter (between content and border) instead of squashing the wording.
  const scrollCls = "flex-1 py-3 -mr-5 pr-5 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"
  // Two-level nav state: "Apply as" is the landing (type + parties + returning); the form panes (step 0–7) group
  // into Personal details / Finances / Documents / Application review via PANE_META. inWizard = past the landing.
  const inWizard = begun
  const activeKey = inWizard ? nav.paneMeta[step]?.key : undefined // the active pane's key drives render + next dispatch
  const activeGroup = inWizard ? nav.paneMeta[step].group : "Apply as"
  // The panel header reads "Group · sub" in the wizard and "Apply to · {unit}" on the landing.
  const headerTitle = inWizard ? activeGroup : "Apply to"
  const headerSub = inWizard ? nav.paneMeta[step].sub : (listingTitle ?? "this home")
  const applyAsDesc = type ? `${TYPE_LABEL[type]} · ${leaseType}` : "Choose how you apply"
  // JURISTIC = TWO distinct rails (the LOCKED roster model — company is a card, not a phase): show ONLY the company
  // section during the company phase (and at the roster hub), then ONLY the director's own section once they're past
  // the sign-off. `nav` stays the full machine (dispatch/render); the RAIL display is phase-scoped + offset.
  const { railNav, railOffset, railStep, railMaxReached } = resolveRail(juristic, nav, step, companyPaneCount, maxReached)
  const navStates = computeStepStates(railNav, { activeGroup, step: railStep, maxReached: railMaxReached, inWizard, typePicked: type !== null, hasApplication: !!applicationId, applyAsDesc })
  const onNav = (t: number | "apply-as") => { if (t === "apply-as") setBegun(false); else navTo(t + railOffset) }
  const onJumpRail = (t: number) => navTo(t + railOffset)
  const advanceStep = () => { advance(step + 1); autosave(step + 1) } // plain "Next" for panes with no validation (co-address)
  // The current step's forward action (header "Next →"). Review has NO header action (its buttons live in the page
  // body) → returns null there.
  const navNext = resolveNavNext({
    inWizard, atRoster, activeKey, companyImDirector, companyRole, personalStep, docsReady, busy,
    continueCompanyInfo, advanceStep, afterCompanyReview, createApplication, continueCompanyFinances, companyConsent, emailGateSatisfied,
    continueIdentity, continueAddress, continueEmployment, continueIncome, continueDocsRequired, finishDocuments,
  })
  const showBackBtn = inWizard && !atRoster // the status menu is the home — no Back there
  const showSaveBtn = inWizard && !!form.email && personalStep <= LAST_DATA_STEP && screeningStatus === "idle"

  return {
    // state + setters
    commercial, type, step, form, set, errors, emp, setEmp, income, setIncome,
    dependentAdults, setDependentAdults, dependentMinors, setDependentMinors, commitments, setCommitments,
    applicationId, token, busy, saved, justSaved, resumeLink, emailed, saveModalOpen, setSaveModalOpen, emailVerified, setEmailVerified,
    coApplicants, setCoApplicants, company, setCompany, companyImDirector, setCompanyImDirector, companySentToDirector, companyRole,
    addApplicantOpen, setAddApplicantOpen, newCo, setNewCo, begun, setBegun, docFiles, docEscape, setDocEscape,
    consent, setConsent, companyConsent, setCompanyConsent, atRoster, setAmendUnlocked, amendGateStep, setAmendGateStep,
    screeningStatus, assessment,
    // handlers
    selectType, beginApplication, goBack, onOpenCard, backToMenu, resendResumeLink, loginToPrefill, saveAndExit,
    confirmAddApplicant, uploadDoc, removeDoc, renameDoc, amendAt, applyAmend, submitApplication,
    // derived
    nav, personalStep, juristic, docApplicantType, docCategories, companyDocCategories, docsReady, applicantsGreen,
    emailGateSatisfied, companyRosterPersons, statusMenuCompany, statusMenuPersons, isMultiParty, disclaimer, scrollCls,
    inWizard, activeKey, activeGroup, headerTitle, headerSub, railNav, railStep, railMaxReached, navStates, onNav,
    onJumpRail, navNext, showBackBtn, showSaveBtn, askingRentCents,
  }
}
