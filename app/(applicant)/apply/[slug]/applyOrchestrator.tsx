"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive apply wizard (client island)
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  A 4-card LANDING (application type) → a functional grouped wizard wired to the REAL backend
 *         (Personal details · Finances [Employment/Income/Expenses] · Documents [Required/Optional] · Review).
 *         Every type except "Just me" implies >1 party, so the co-applicant/company invite is captured UP
 *         FRONT (an InviteCapture panel right after the landing) and dispatched once the application exists.
 *           Landing — Just me · Couple/multiple · Company · On behalf/guarantor (each a short blurb).
 *           1 Personal details — the applicant (or, for a company, the contact/director) reuses the
 *             add-tenant capture (IndividualIdentity; SA-ID auto-fills DOB+gender).
 *           2 Address — mandatory current address.
 *           3 Finances — employment status + date employed + employer, then an "excel" sources-of-income grid
 *             (Employment gross + rental/maintenance/… + custom), each with a period (expenses to follow)
 *             (month/quarter/annual). The monthly total drives affordability → POST create (also persists
 *             the breakdown to applications.income_sources + employment_start_date; probation is inferred,
 *             and the held at-selection invites are dispatched here once the application id exists).
 *           4 Documents — upload to the application-docs bucket + AI detect (same as the live flow).
 *           5 Applicants — status roster of every party (primary + company + co-applicants), each invited
 *             with email + id_number (links them) → POST /api/applications/[id]/co-applicant; + add another.
 *             Submit unlocks only when every applicant is "green" (information complete).
 *           6 Submit — POPIA consent → POST submit → reveal the pre-screen "application preview".
 *         The server page renders the shell + left cards and passes slug/orgId/rent + agent contact.
 */

import { useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { CheckCircle2, Users, ArrowLeft, ArrowRight, Clock } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { useBegun } from "./applyChrome"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { type CompanyInfo, COMPANY_SUBTABS, CompanySubTabs, StepCompanyDetails } from "./applyCompany"
import {
  type ApplicantType, type CoRole, type ScreeningStatus, type SetFn, type DocFile, type CoApplicant, type Emp, type IncomePeriod, type IncomeRow,
  STEP_EXPENSES, STEP_DOCUMENTS, STEP_DOCS_OPTIONAL, STEP_REVIEW, LAST_DATA_STEP,
  SELF_EMPLOYED_TYPES,
  INCOME_LABEL, seedIncomeFor, COMMITMENT_LABEL, seedCommitments,
  intOrNull, allAmountsEmpty, posOrNull, seedIfEmpty, numStr, rowMonthlyCents, totalMonthlyCents, incomeSourcesPayload, incomeKeys, blankCo,
} from "./applyDomain"
import { ApplyAsPane } from "./applyLanding"
import { StepPersonal, StepAddress, StepEmployment, StepIncome, StepExpenses, StepDocuments } from "./applyIndividual"
import { StepSubmit } from "./applyReview"
import { PANE_META, computeStepStates, StepRail, StepBar, SubTabs } from "./applyNav"
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
  // Sequential company flow: the company phase (details + finances) runs BEFORE the personal flow. companyDone
  // flips once it's saved — then the director's personal flow takes over (or the invited director does it).
  const [companyDone, setCompanyDone] = useState(!!resume) // a resumed draft is already past the company phase
  const [companyStep, setCompanyStep] = useState(0) // sub-tab within the company phase: 0 info · 1 address · 2 finances
  const [companySentToDirector, setCompanySentToDirector] = useState(false)
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
    else if (t === "couple" || t === "company") setCoApplicants((cur) => (cur.length > 0 ? cur.map((c) => ({ ...c, role: "co_applicant" as CoRole })) : [blankCo("co_applicant")]))
    else setCoApplicants([]) // individual
  }

  /** Begin (first time) / Continue (re-editing "Apply as"): validate the chosen type + parties, then enter the
   *  form panes. Invites are held in state and dispatched once the application exists (createApplication). */
  function beginApplication() {
    if (!type) { toast.error("Choose how you're applying."); return }
    if (type === "company" && !company.companyType) { toast.error("Please select the company type."); return }
    if ((type === "couple" || type === "guarantor" || type === "company") && !(coApplicants[0] && coComplete(coApplicants[0]))) {
      toast.error(type === "company" ? "Add the director applying on the company's behalf." : "Add the co-applicant's name, email and ID number."); return
    }
    // Company + "it's me": the director IS the primary applicant — carry their Apply-as details into the personal
    // flow and drop them from the invite list (they complete it here, not via an emailed link).
    if (type === "company" && companyImDirector && coApplicants[0]) {
      const me = coApplicants[0]
      setForm((f) => ({ ...f, firstName: me.firstName || f.firstName, lastName: me.lastName || f.lastName, email: me.email || f.email, idNumber: me.idNumber || f.idNumber }))
      // NB: the row stays in state (so Back preserves it) — dispatchInvites skips this primary director.
    }
    setBegun(true)
    setMaxReached((m) => Math.max(m, step))
  }

  function goBack() {
    if (type === "company" && !companyDone) {
      if (companyStep > 0) { setCompanyStep(companyStep - 1); return } // step back through the company sub-tabs
      setBegun(false); return // first company tab → back to "Apply as"
    }
    if (step === 0) setBegun(false) // back from the first form pane → the "Apply as" landing (type preserved)
    else navTo(step - 1)
  }

  // End of the company phase. "It's me" → drop into the personal flow (identity pre-filled at begin). Otherwise
  // save the company + email the director their link, and show a "sent" state (they complete the rest).
  function completeCompanyPhase() {
    // Identity lives on the first sub-tab — bounce there if it's incomplete so the error points at the right field.
    if (!company.name?.trim()) { setCompanyStep(0); toast.error("Add the company's registered name."); return }
    if (!company.companyType) { setCompanyStep(0); toast.error("Select the company type."); return }
    if (companyImDirector) {
      setCompanyDone(true)
      advance(0)
      autosave(0)
      return
    }
    void (async () => {
      setBusy(true)
      try {
        const r = await saveDraft(STEP_DOCUMENTS, { explicit: true })
        if (!r) return
        await dispatchInvites(r.id)
        setCompanySentToDirector(true)
        toast.success("Sent to the director to complete the application.")
      } finally { setBusy(false) }
    })()
  }

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
    advance(1)
    autosave(1)
  }

  function continueAddress() {
    const e = validateAddressStep(form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("A current address is required."); return }
    advance(2)
    autosave(2)
  }

  // Finances is three sub-tabs: Employment (status/employer/dependents) → Income (sources) → Expenses
  // (obligations). The application row is only CREATED leaving the last one (createApplication), so these two
  // advances just move forward (autosave is a no-op until the draft exists).
  function continueEmployment() {
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    // (Re)seed the income grid from the chosen status — but only while nothing has been typed, so changing status
    // (e.g. → unemployed) refreshes the seed instead of leaving a stale "Salary" row, without clobbering entries.
    if (allAmountsEmpty(income)) setIncome(seedIncomeFor(emp.employment_type))
    advance(3)
    autosave(3)
  }

  function continueIncome() {
    // Pre-seed the commitments grid (the common 2–3) on first entry to Expenses, so it opens as a grid.
    seedIfEmpty(commitments, setCommitments, seedCommitments)
    advance(4)
    autosave(4)
  }

  // UPSERT the draft (create on first save, update thereafter — keyed on the held applicationId/token). Every
  // call EXTENDS the 30-day token server-side so a long document-gathering session isn't killed mid-edit. Shared
  // by createApplication (Income→Documents) and "Save & finish later". Email is required (to send the link).
  async function saveDraft(stepToSave: number, opts?: { explicit?: boolean; silent?: boolean }): Promise<{ id: string; url: string | null; emailed: boolean } | null> {
    if (!form.email) { if (!opts?.silent) { toast.error("Add your email first so we can send you a link to finish later.") } return null }
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
          first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone,
          id_type: form.idType || "sa_id", id_number: form.idNumber, date_of_birth: form.dob || "",
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
    // Employment status only — a R0 primary (student/dependent) applies with a guarantor whose income is
    // captured separately, so don't force an income figure here.
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    setBusy(true)
    try {
      // On the FIRST create, email the resume link + toast — so the way-back is discoverable proactively, not
      // hidden behind a button. Subsequent passes are silent updates.
      const firstCreate = !applicationId
      const r = await saveDraft(STEP_DOCUMENTS, firstCreate ? { explicit: true } : undefined)
      if (!r) return
      void dispatchInvites(r.id)                // fire the held at-selection invites now the application exists
      if (firstCreate) {
        setSaved(true); setResumeLink(r.url); setEmailed(r.emailed)
        toast.success(r.emailed
          ? `Progress saved — we've emailed a link to ${form.email} to finish later.`
          : "Progress saved — you can finish later.")
      }
      advance(STEP_DOCUMENTS)
    } finally {
      setBusy(false)
    }
  }

  // Send every complete-but-not-yet-invited co-applicant (id_number links them to the application). Called at
  // create (the at-selection invites) and again from the Applicants step (any added there).
  async function dispatchInvites(appId: string) {
    // For "company + it's me", the first director IS the primary applicant — never invite them.
    const skipPrimaryDirector = type === "company" && companyImDirector
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
      advance(STEP_REVIEW)
      autosave(STEP_REVIEW) // persist draft_step so a refresh/resume lands back on the review, not Documents
    } finally {
      setBusy(false)
    }
  }

  // Documents is two sub-tabs: Required (the gating core) → Optional (strengtheners). Required→Optional just
  // advances once the required docs are satisfied; finishDocuments runs leaving Optional → Applicants.
  function continueDocsRequired() { advance(STEP_DOCS_OPTIONAL); autosave(STEP_DOCS_OPTIONAL) }

  /** Amend the application (add applicant / upload docs / edit details) → re-enter that step; the user
   *  re-submits to run a fresh screening iteration (the 14M self-improvement loop). */
  function amendAt(toStep: number) { setScreeningStatus("idle"); setAssessment(null); setStep(toStep) }

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

  const docCategories = deriveDocCategories(incomeKeys(income), emp.employment_type, form.idType, type)
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
  // The footer ALWAYS shows the pre-selection disclaimer — the save confirmation lives in the modal, not here.
  const disclaimer = "Pre-selection only — affordability and shortlisting. No credit check or bureau enquiry runs at this stage — only after you submit and give explicit consent."
  const scrollCls = "flex-1 py-3 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"
  // Two-level nav state: "Apply as" is the landing (type + parties + returning); the form panes (step 0–7) group
  // into Personal details / Finances / Documents / Application review via PANE_META. inWizard = past the landing.
  const inWizard = begun
  // Company applications run a short COMPANY PHASE (business details + finances) before the personal flow.
  const companyPhaseActive = begun && type === "company" && !companyDone
  const activeGroup = inWizard ? PANE_META[step].group : "Apply as"
  // The panel header reads "Group · sub" in the wizard, "Company · …" during the company phase, and
  // "Apply to · {unit}" on the landing. activeGroup still drives the rail's "Apply as" step name.
  let headerTitle = inWizard ? activeGroup : "Apply to"
  let headerSub = inWizard ? PANE_META[step].sub : (listingTitle ?? "this home")
  if (companyPhaseActive) { headerTitle = "Company"; headerSub = COMPANY_SUBTABS[companyStep] }
  const applyAsDesc = type ? `${TYPE_LABEL[type]} · ${leaseType}` : "Choose how you apply"
  const navStates = computeStepStates(activeGroup, step, maxReached, inWizard, type !== null, !!applicationId, applyAsDesc)
  const onNav = (t: number | "apply-as") => { if (t === "apply-as") setBegun(false); else navTo(t) }
  // The current step's forward action — rendered in the panel header (intermediate = "Next →"; the final
  // review/submit uses the primary style). Back + Save live alongside it; the footer keeps only the disclaimer.
  const navNext = ((): { label: string; onClick: () => void; disabled?: boolean; primary?: boolean } | null => {
    if (!inWizard) return null
    if (companyPhaseActive) {
      if (companyStep < COMPANY_SUBTABS.length - 1) return { label: "Next", onClick: () => setCompanyStep(companyStep + 1) }
      return { label: companyImDirector ? "Continue to your details" : "Send to the director", onClick: completeCompanyPhase, disabled: busy }
    }
    if (step === 0) return { label: "Next", onClick: continueIdentity }
    if (step === 1) return { label: "Next", onClick: continueAddress }
    if (step === 2) return { label: "Next", onClick: continueEmployment }
    if (step === 3) return { label: "Next", onClick: continueIncome }
    if (step === STEP_EXPENSES) return { label: "Next", onClick: createApplication }
    if (step === STEP_DOCUMENTS) return { label: "Next", onClick: continueDocsRequired, disabled: !docsReady }
    if (step === STEP_DOCS_OPTIONAL) return { label: "Next", onClick: finishDocuments }
    // Review has NO header action — its "Continue to review" / "Submit" buttons live in the page body. The header
    // keeps only the Back button.
    return null
  })()
  const showBackBtn = inWizard
  const showSaveBtn = inWizard && !!form.email && step <= LAST_DATA_STEP && screeningStatus === "idle"
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
            <div className="min-h-0 flex-1 overflow-y-auto p-2"><StepRail states={navStates} step={step} maxReached={maxReached} onNav={onNav} onJumpStep={navTo} /></div>
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
          {inWizard && !companyPhaseActive && <SubTabs activeGroup={activeGroup} step={step} maxReached={maxReached} onJumpStep={navTo} />}
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
              commercial={commercial} type={type} onSelect={selectType}
              coApplicants={coApplicants} setCoApplicants={setCoApplicants} company={company} setCompany={setCompany}
              imDirector={companyImDirector} setImDirector={setCompanyImDirector}
              loggedInEmail={verifiedEmail ?? null} onResend={resendResumeLink} onLogin={loginToPrefill}
              onBegin={beginApplication} resuming={!!resume} busy={busy}
            />
          </div>
        )}

        {/* Company phase — a short tabbed sub-flow (info · address · finances) before the personal flow. */}
        {companyPhaseActive && (
          <div className={scrollCls}>
            <CompanySubTabs step={companyStep} onJump={setCompanyStep} />
            <StepCompanyDetails company={company} setCompany={setCompany} imDirector={companyImDirector} companyStep={companyStep} />
          </div>
        )}

        {/* "Sent to director" — the filler isn't the director, so they hand off and there's nothing more to do. */}
        {companySentToDirector && (
          <div className={scrollCls}>
            <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-6">
              <h2 className="flex items-center gap-2 text-lg font-medium text-[var(--ink)]"><CheckCircle2 className="size-5 text-emerald-600" /> Sent to the director</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">We&apos;ve emailed {coApplicants[0]?.email ? <strong className="text-[var(--ink)]">{coApplicants[0].email}</strong> : "the director"} a secure link to complete the application — adding their details, the income picture and consent. You can close this page.</p>
            </div>
          </div>
        )}

        {begun && type !== null && !companyPhaseActive && !companySentToDirector && (
          <>
            <div className={scrollCls}>
              {step === 0 && <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} coApplicants={coApplicants} />}
              {step === 1 && <StepAddress form={form} set={set} errors={errors} />}
              {step === 2 && <StepEmployment emp={emp} setEmp={setEmp} />}
              {step === 3 && <StepIncome income={income} setIncome={setIncome} variable={SELF_EMPLOYED_TYPES.includes(emp.employment_type) || emp.employment_type === "commission"} />}
              {step === STEP_EXPENSES && <StepExpenses dependentAdults={dependentAdults} setDependentAdults={setDependentAdults} dependentMinors={dependentMinors} setDependentMinors={setDependentMinors} commitments={commitments} setCommitments={setCommitments} />}
              {step === STEP_DOCUMENTS && <StepDocuments tab="required" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />}
              {step === STEP_DOCS_OPTIONAL && <StepDocuments tab="optional" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />}
              {step === STEP_REVIEW && <StepSubmit form={form} emp={emp} income={income} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} coApplicants={coApplicants} applicantsGreen={applicantsGreen} screeningStatus={screeningStatus} assessment={assessment} onAmend={amendAt} onRerun={submitApplication} onContinue={submitApplication} onAddApplicant={() => setAddApplicantOpen(true)} applicationId={applicationId} token={token} emailVerified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} />}
            </div>
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
      </main>
    </div>
  )
}
