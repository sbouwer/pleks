/**
 * lib/applications/freeAssessment.ts — Step-1 ZERO-AI assessment (the free stage of the screening funnel).
 *
 * No AI, no extraction — runs at submit on declared figures + the SA-ID decode + upload completeness only (R0 at
 * any volume). Turns the raw declared data into the kind of read an agent acts on (ADDENDUM_14M three-step funnel):
 *   • Affordability framed several ways — declared ratio, rand-left, income multiple, single-vs-combined-income
 *     dependency, residual after declared obligations, estimated move-in cost. UNVERIFIED ("on stated figures").
 *     Guarantors are EXCLUDED from affordability (a backstop, not co-earners — see GUARANTOR_MIN_INCOME_MULTIPLE).
 *   • Identity (free from the SA-ID number) — age + capacity (under-18 can't sign), residency (feeds the
 *     foreign-national path), and a DOB cross-check (ID-encoded vs separately-declared). NEVER gender — it has no
 *     legitimate tenancy-screening purpose and surfacing it invites a discrimination claim.
 *   • Employment stability (declared dates) — tenure + a recently-started flag (probation window).
 *   • Readiness — an itemised, per-party checklist of what's complete vs missing (an incomplete app is a wasted
 *     shortlist; the deep scan has nothing to corroborate).
 *   • A deterministic interpretation library — plain-English "reads" selected by the rule outcomes, so the agent
 *     gets a recommendation rather than numbers to assemble.
 * NOT a confidence score — nothing is verified until the deep scan. Surfaces + sorts; never auto-decides.
 */
import { INCOME_AFFORDABILITY_THRESHOLD, PROBATION_MONTHS, startedWithinProbation } from "@/lib/constants"
import { validateSAId } from "@/lib/parties/partyValidation"
import { calculateCombinedAffordability } from "@/lib/screening/combinedAffordability"
import { residualCapacityCents } from "@/lib/applications/livingFloor"

const MARGINAL_CEILING = 0.35

/** Does ANY surety UNIT's pooled residual absorb the FULL rent? Sureties sharing a suretyGroup pool (declared
 *  joint-&-several, or in-community spouses auto-grouped at capture); an ungrouped guarantor is its own standalone
 *  unit. DELIBERATE: standalone guarantors NEVER pool with each other — one strong surety must cover the whole
 *  rent alone; only a declared joint estate / joint-&-several unit combines. residualCapacity = income − own
 *  obligations − own living floor (absorb the rent ON TOP of their life), so a stretched high-earner is weak. */
function suretyUnitsCoverRent(guarantors: FreeApplicantInput[], rentCents: number): boolean {
  if (rentCents <= 0 || guarantors.length === 0) return false
  const units = new Map<string, FreeApplicantInput[]>()
  guarantors.forEach((g, i) => {
    const key = g.suretyGroup || `solo-${i}`
    units.set(key, [...(units.get(key) ?? []), g])
  })
  return [...units.values()].some((unit) =>
    unit.reduce((sum, m) => sum + residualCapacityCents(m.declaredIncomeCents, m.declaredObligationsCents ?? 0), 0) >= rentCents)
}

export type DeclaredAffordabilityTier = "within" | "marginal" | "below" | "no-income"
export type CompanyVerdict = "strong" | "backstopped" | "fail" // strong=company nets it · backstopped=directors' surety · fail
export type ReadinessBand = "ready" | "partial" | "incomplete"
export type Residency = "citizen" | "permanent_resident" | "foreign" | "unknown"
/** The Step-1 roll-up — an administrative "is this worth a deep scan?" state, the triage-list sort key.
 *  Reds (does-not-qualify, incomplete) sort above amber (missing-docs) above green (verify-ready). */
// "backstopped" = qualifies VIA a surety / company-directors' surety, not on the applicant's/company's own
// affordability — a distinct triage state so the agent sees it's surety-carried, not a clean pass.
export type Step1Status = "verify-ready" | "backstopped" | "missing-docs" | "does-not-qualify" | "incomplete"

/** A required/expected document slot + whether the applicant has uploaded SOMETHING for it (presence, NOT proof
 *  of contents — "uploaded, unverified"). */
export interface DocSlot { key: string; label: string; required: boolean; present: boolean }

export interface FreeApplicantInput {
  role: "primary" | "co_applicant" | "guarantor"
  declaredIncomeCents: number
  childMaintenanceCents?: number             // child maintenance RECEIVED — earmarked for the child, so it
                                             // offsets that dependent's cost; NOT counted as rent-payable income
  declaredObligationsCents?: number | null  // existing monthly debits/commitments, if declared
  idType: string | null
  idNumber: string | null
  declaredDob?: string | null         // separately-declared DOB (YYYY-MM-DD) — for the ID cross-check
  employmentStartDate?: string | null // for tenure + probation (primary only today)
  contractEndDate?: string | null     // stated fixed-term contract end (YYYY-MM-DD) — vs the lease term
  documentsUploaded?: boolean         // any docs at all (co-applicant readiness); undefined = unknown
  documents?: DocSlot[]               // itemised slots (primary) — powers the documents checklist
  complete: boolean                   // finished their part (identity + income + docs + consent)
  // Matrimonial Property Act context (declared). regime "in_community" → a surety needs spousal consent
  // (s15(2)(h)) and the spouse's estate pools. Captured for every applicant; load-bearing for surety-givers.
  maritalStatus?: "single" | "married" | "divorced" | "widowed" | null
  maritalRegime?: "in_community" | "out_anc" | "out_accrual" | null
  // Sureties sharing a suretyGroup form ONE pooled unit (married-in-community spouses, auto-grouped at capture;
  // or guarantors who chose joint & several). An ungrouped guarantor is its own standalone unit.
  suretyGroup?: string | null
}

/** Per-party readiness line. PII-safe: labelled by role/index, never by name (free_assessment is stored jsonb). */
export interface ReadinessItem {
  label: string
  status: "ok" | "missing" | "invalid"
  missing: string[]                   // which parts are outstanding (e.g. ["documents", "consent"])
}

export interface IdentitySignal {
  ageYears: number | null
  underageCannotSign: boolean         // age < 18 → no capacity to contract
  residency: Residency
  dobMatchesDeclared: boolean | null  // ID-encoded DOB vs separately-declared; null = can't compare
}

export interface EmploymentSignal {
  tenureMonths: number | null
  recentlyStarted: boolean            // started within the probation window
  contractEndDate: string | null      // stated fixed-term contract end (echoed for the agent)
  contractEndsBeforeLease: boolean    // stated contract ends before the lease term would run out
}

export type InterpretationKind = "positive" | "caution" | "action"
export interface Interpretation { kind: InterpretationKind; text: string }

export interface FreeAssessmentResult {
  // Affordability (declared / unverified)
  primaryIncomeCents: number
  combinedIncomeCents: number          // primary + co-applicants (guarantors excluded), EXCL child maintenance
  childMaintenanceCents: number        // child maintenance received (summed) — excluded from affordability income
  declaredObligationsCents: number     // summed across primary + co-applicants
  declaredRatioPct: number | null      // rent ÷ combined income, on STATED figures
  affordabilityTier: DeclaredAffordabilityTier
  randLeftAfterRentCents: number | null
  randLeftAfterObligationsCents: number | null  // null if no obligations were declared
  incomeMultiple: number | null        // combined income ÷ rent (×, 1 dp)
  primaryAloneClears: boolean          // does the primary alone clear the 30% guideline?
  coApplicantDependency: boolean       // affordable only on the combined income (single-income risk)
  hasGuarantor: boolean                // a guarantor/surety is on the application
  guarantorBacksRent: boolean          // ≥1 surety UNIT's pooled residual absorbs the FULL rent (standalone
                                       //   guarantors never pool; only declared joint-&-several / spouse units do)
  spousalConsentRequired: boolean      // an in-community surety-giver is present → spousal consent needed (s15 MPA)
  // Company (juristic) applications — the COMPANY is the payer (net profit, not turnover); the directors are the
  // surety backstop (their combined residual, via the guarantor units above). null/false for personal applications.
  isCompany: boolean
  companyNetMonthlyCents: number | null     // declared net profit ÷ 12 — the payer's real capacity (turnover is NOT this)
  companyTurnoverMonthlyCents: number | null // declared turnover ÷ 12 — CONTEXT/scale only, never in the affordability test
  companyAffordsAlone: boolean              // company net profit alone covers the rent (residual, after commitments)
  companyVerdict: CompanyVerdict | null  // strong=company nets it · backstopped=directors' surety carries · fail
  companyAgeYears: number | null            // from the CIPC reg year — a mature co (≥3) without AFS is a flag
  estimatedMoveInCents: number | null  // deposit + first month's rent
  // Identity (primary) + employment (primary)
  identity: IdentitySignal
  employment: EmploymentSignal
  // Documents (primary's required/expected slots) + readiness
  documents: DocSlot[]
  allRequiredDocsPresent: boolean
  readiness: { band: ReadinessBand; items: ReadinessItem[]; allComplete: boolean; incompleteCount: number; invalidIdCount: number; total: number }
  // The administrative roll-up (the triage sort key) + the interpretation reads
  rollup: Step1Status
  interpretations: Interpretation[]
}

export interface FreeAssessmentOptions {
  depositCents?: number | null         // unit deposit; falls back to 1× rent for the move-in estimate
  leaseTermMonths?: number | null      // listing's lease term — for the contract-end-vs-lease signal; skip if absent
  asOf?: Date                          // for deterministic age/tenure in tests
  // Present ONLY for a company application — the company is the payer; directors (guarantor-role, joint suretyGroup)
  // are the backstop. netProfitMonthly is the capacity tested; turnoverMonthly is context/scale only.
  company?: { netProfitMonthlyCents: number | null; turnoverMonthlyCents?: number | null; monthlyCommitmentsCents?: number | null; ageYears?: number | null } | null
}

/** True only when an SA-ID number fails the Luhn checksum; a passport/other id type is never "invalid" here. */
function idChecksumFails(idType: string | null, idNumber: string | null): boolean {
  if (idType !== "sa_id") return false
  return validateSAId(idNumber ?? undefined)?.valid !== true
}

function yearsBetween(from: Date, to: Date): number {
  let age = to.getFullYear() - from.getFullYear()
  const m = to.getMonth() - from.getMonth()
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) age -= 1
  return age
}

function monthsBetween(from: Date, to: Date): number {
  const base = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return base - (to.getDate() < from.getDate() ? 1 : 0)
}

function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type SaDecode = ReturnType<typeof validateSAId>

function residencyOf(idType: string | null, decoded: SaDecode): Residency {
  if (decoded?.valid) return decoded.citizenship === "SA Citizen" ? "citizen" : "permanent_resident"
  if (idType && idType !== "sa_id") return "foreign"
  return "unknown"
}

function parseDob(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Identity from the primary's SA-ID (free decode) + the separately-declared DOB. Gender is deliberately ignored. */
function identitySignal(primary: FreeApplicantInput | undefined, asOf: Date): IdentitySignal {
  if (!primary) return { ageYears: null, underageCannotSign: false, residency: "unknown", dobMatchesDeclared: null }

  const decoded = primary.idType === "sa_id" ? validateSAId(primary.idNumber ?? undefined) : null
  const idDob = decoded?.valid ? decoded.dob : null
  const declaredDob = parseDob(primary.declaredDob)

  // Age from the strongest DOB we have: a valid ID's encoded DOB, else the separately-declared DOB.
  const dobForAge = idDob ?? declaredDob
  const ageYears = dobForAge ? yearsBetween(dobForAge, asOf) : null
  // Cross-check only when we have BOTH an ID-encoded DOB and a separate declaration.
  const dobMatchesDeclared = idDob && declaredDob ? fmtYmd(idDob) === fmtYmd(declaredDob) : null

  return {
    ageYears,
    underageCannotSign: ageYears != null && ageYears < 18,
    residency: residencyOf(primary.idType, decoded),
    dobMatchesDeclared,
  }
}

function employmentSignal(primary: FreeApplicantInput | undefined, asOf: Date, leaseTermMonths: number | null | undefined): EmploymentSignal {
  // Contract-end-vs-lease: a declared, deterministic signal. Skip gracefully when either the stated contract end
  // or the listing's lease term is absent (never guess a lease term). Lease end ≈ asOf + term.
  const contractEndDate = primary?.contractEndDate ?? null
  const contractEnd = parseDob(contractEndDate)
  let contractEndsBeforeLease = false
  if (contractEnd && leaseTermMonths && leaseTermMonths > 0) {
    const leaseEnd = new Date(asOf)
    leaseEnd.setMonth(leaseEnd.getMonth() + leaseTermMonths)
    contractEndsBeforeLease = contractEnd.getTime() < leaseEnd.getTime()
  }

  const start = primary?.employmentStartDate ? new Date(primary.employmentStartDate) : null
  if (!start || Number.isNaN(start.getTime())) return { tenureMonths: null, recentlyStarted: false, contractEndDate, contractEndsBeforeLease }
  return {
    tenureMonths: Math.max(0, monthsBetween(start, asOf)),
    recentlyStarted: startedWithinProbation(primary?.employmentStartDate, asOf),
    contractEndDate,
    contractEndsBeforeLease,
  }
}

function readinessItem(a: FreeApplicantInput, label: string): ReadinessItem {
  const missing: string[] = []
  const idInvalid = idChecksumFails(a.idType, a.idNumber)
  if (!a.idNumber) missing.push("identity")
  if (a.declaredIncomeCents <= 0) missing.push("income")
  if (a.documentsUploaded === false) missing.push("documents")
  if (!a.complete) missing.push("consent")
  let status: ReadinessItem["status"]
  if (idInvalid) status = "invalid"
  else if (missing.length > 0) status = "missing"
  else status = "ok"
  return { label, status, missing }
}

/** The affordability read — ONE line by case. A COMPANY reads off the company verdict (net profit vs rent, with
 *  directors' surety as the backstop); everyone else off the personal tier, with the guarantor backstop appended
 *  (companies fold the directors' surety into the verdict, so they skip the standalone guarantor line). */
function affordabilityRead(r: Omit<FreeAssessmentResult, "interpretations">, ready: boolean, goodMultiple: boolean): Interpretation[] {
  const out: Interpretation[] = []
  if (r.isCompany) {
    if (r.companyVerdict === "strong") out.push({ kind: "positive", text: "The company's declared net profit covers the rent — affordable from its own finances (verified against AFS / bank / SARS at the deep scan)." })
    else if (r.companyVerdict === "backstopped") out.push({ kind: "caution", text: "The company's declared net profit is thin for the rent, but the directors' combined surety can carry it — a backstopped application leaning on directors' surety." })
    else out.push({ kind: "action", text: "Neither the company's declared net profit nor the directors' combined surety covers the rent — affordability concern." })
    return out
  }
  if (r.affordabilityTier === "no-income") out.push({ kind: "action", text: "No income declared — can't assess affordability. Capture income before shortlisting." })
  else if (r.affordabilityTier === "within" && ready && goodMultiple) out.push({ kind: "positive", text: "Strong on paper: affordable and complete. Good candidate for a deep scan." })
  else if (r.affordabilityTier === "within") out.push({ kind: "positive", text: "Affordable on declared income (within the 30% guideline)." })
  else if (r.affordabilityTier === "marginal") out.push({ kind: "caution", text: "Slightly over the 30% guideline — affordable if income verifies; a co-applicant or larger deposit would strengthen it." })
  else if (r.coApplicantDependency) out.push({ kind: "caution", text: "Only affordable on the combined income — single-income risk if one tenant leaves." })
  else out.push({ kind: "caution", text: "Rent is high relative to declared income — affordability concern." })
  if (r.hasGuarantor && r.affordabilityTier !== "within" && r.guarantorBacksRent) out.push({ kind: "positive", text: "Backed by a surety whose residual income can absorb the full rent on top of their own commitments." })
  else if (r.hasGuarantor && !r.guarantorBacksRent) out.push({ kind: "caution", text: "The surety's residual income (after their own commitments and living costs) doesn't cover the full rent — limited additional security." })
  return out
}

/** The deterministic interpretation library — plain-English reads keyed to the computed state. Ordered most→least
 *  urgent. Strictly financial + completeness + capacity; never a protected attribute, never an auto-decision. */
function buildInterpretations(r: Omit<FreeAssessmentResult, "interpretations">): Interpretation[] {
  const out: Interpretation[] = []
  const ready = r.readiness.band === "ready"
  const goodMultiple = r.incomeMultiple != null && r.incomeMultiple >= 3

  if (r.identity.underageCannotSign) {
    out.push({ kind: "action", text: "Applicant is under 18 — no capacity to sign a lease without a guardian." })
  }
  if (r.identity.dobMatchesDeclared === false) {
    out.push({ kind: "caution", text: "The declared date of birth doesn't match the ID number — worth confirming before relying on it." })
  }

  // Affordability read (one) — company verdict or personal tier + guarantor backstop (extracted helper).
  out.push(...affordabilityRead(r, ready, goodMultiple))

  // A MATURE company (≥3 years, from the CIPC reg year) that can't produce the AFS it should have is a flag — a
  // younger company is exempt (its AFS slot was relaxed). Financial completeness, never a protected attribute.
  if (r.isCompany && (r.companyAgeYears ?? 0) >= 3) {
    const afs = r.documents.find((d) => d.key === "afs")
    if (afs?.required && !afs.present) {
      out.push({ kind: "caution", text: `The company is ~${r.companyAgeYears} years old but no annual financial statements were provided — a company of this age should have them; verify before relying on the declared profit.` })
    }
  }

  if (r.spousalConsentRequired) {
    // s15 MPA: an in-community surety-giver's spouse must consent — but the INSTRUMENT (annexure / witness /
    // co-surety / acknowledgement) is counsel's drafting choice, executed at signing. Surface it as a CONTINGENCY,
    // not a co-suretyship, and tailor to whether the security is load-bearing (relied on) or merely additional.
    const suretyLoadBearing = r.affordabilityTier !== "within" && r.guarantorBacksRent
    out.push({ kind: "action", text: suretyLoadBearing
      ? "A surety is married in community of property and this application relies on that surety — spousal consent (s15 MPA) must be executed at signing. Treat the security as CONTINGENT until then."
      : "A surety is married in community of property — spousal consent (s15 MPA) must be executed at signing. The application stands on the applicant's own merit; treat the surety as additional, contingent security." })
  }

  if (r.employment.recentlyStarted) {
    out.push({ kind: "caution", text: `Less than ${PROBATION_MONTHS} months in the current role — employment not yet established.` })
  }
  if (r.employment.contractEndsBeforeLease) {
    out.push({ kind: "caution", text: "Stated contract ends before the lease term — income may not cover the full lease. Worth asking the applicant if it's expected to renew." })
  }
  if (r.childMaintenanceCents > 0) {
    out.push({ kind: "caution", text: "Child maintenance received is treated as covering the child's costs (a reduced dependent cost), not as rent-payable income — so it's excluded from the affordability figure above." })
  }
  if (r.identity.residency === "foreign") {
    out.push({ kind: "caution", text: "Foreign national — SA credit data may be limited; see the foreign-national checks." })
  }

  // Readiness (action) — the single most decision-relevant free signal
  if (r.readiness.band !== "ready") {
    const incomplete = r.readiness.items.filter((i) => i.status !== "ok")
    const bits = Array.from(new Set(incomplete.flatMap((i) => i.missing)))
    const detail = bits.length > 0 ? ` (missing: ${bits.join(", ")})` : ""
    out.push({ kind: "action", text: `Incomplete${detail} — request before shortlisting, or the deep scan has nothing to corroborate.` })
  }

  return out
}

function affordabilityTierOf(combinedIncome: number, ratio: number | null): DeclaredAffordabilityTier {
  if (combinedIncome <= 0) return "no-income"
  if (ratio != null && ratio <= INCOME_AFFORDABILITY_THRESHOLD) return "within"
  if (ratio != null && ratio <= MARGINAL_CEILING) return "marginal"
  return "below"
}

/** The administrative roll-up, reds first: their declared numbers don't work, OR they didn't finish, OR a required
 *  doc is missing, else it's coherent enough to be worth a (paid) deep scan. A sort key + suggestion — never an
 *  auto-decline; ID validity is an agent-only fraud check and is NOT folded in here. */
type AffordabilityOutcome = "clear" | "backstopped" | "fail" // clear = affords on own merit; backstopped = via surety

function rollupOf(outcome: AffordabilityOutcome, allComplete: boolean, allRequiredDocsPresent: boolean): Step1Status {
  if (outcome === "fail") return "does-not-qualify"  // neither own affordability nor a covering surety
  if (!allComplete) return "incomplete"
  if (!allRequiredDocsPresent) return "missing-docs"
  return outcome === "backstopped" ? "backstopped" : "verify-ready"
}

/** Reduce the affordability picture to one outcome the rollup consumes. A COMPANY reads off its verdict (strong→
 *  clear, backstopped→via directors' surety, fail); a PERSONAL applicant affords clear (within/marginal) or is
 *  rescued by a covering surety unit (below/no-income + guarantorBacksRent → backstopped), else fails. */
function affordabilityOutcomeOf(isCompany: boolean, companyVerdict: CompanyVerdict | null, tier: DeclaredAffordabilityTier, guarantorBacksRent: boolean): AffordabilityOutcome {
  if (isCompany) {
    if (companyVerdict === "backstopped") return "backstopped"
    if (companyVerdict === "fail") return "fail"
    return "clear" // strong
  }
  if (tier === "below" || tier === "no-income") return guarantorBacksRent ? "backstopped" : "fail"
  return "clear" // within / marginal
}

function buildReadiness(applicants: FreeApplicantInput[]): FreeAssessmentResult["readiness"] {
  let coCount = 0, guCount = 0
  const items = applicants.map((a) => {
    let label: string
    if (a.role === "primary") label = "Primary applicant"
    else if (a.role === "guarantor") { guCount += 1; label = guCount > 1 ? `Guarantor ${guCount}` : "Guarantor" }
    else { coCount += 1; label = `Co-applicant ${coCount}` }
    return readinessItem(a, label)
  })
  const total = applicants.length
  const incompleteCount = applicants.filter((a) => !a.complete).length
  const invalidIdCount = applicants.filter((a) => idChecksumFails(a.idType, a.idNumber)).length
  const allComplete = incompleteCount === 0
  let band: ReadinessBand
  if (allComplete && invalidIdCount === 0) band = "ready"
  else if (total > 0 && incompleteCount >= total) band = "incomplete"
  else band = "partial"
  return { band, items, allComplete, incompleteCount, invalidIdCount, total }
}

export function freeAssessment(rentCents: number, applicants: FreeApplicantInput[], opts: FreeAssessmentOptions = {}): FreeAssessmentResult {
  const asOf = opts.asOf ?? new Date()

  // Affordability: co-applicants share the rent → summed; guarantors are a backstop → excluded. Child maintenance
  // received is earmarked for the child (offsets that dependent's cost), so it's NOT rent-payable income — net it
  // out of each applicant's affordability income.
  const affordabilityIncomeOf = (a: FreeApplicantInput) => Math.max(0, a.declaredIncomeCents - (a.childMaintenanceCents ?? 0))
  const primaryApplicant = applicants.find((a) => a.role === "primary")
  const primary = primaryApplicant ? affordabilityIncomeOf(primaryApplicant) : 0
  const coIncomes = applicants.filter((a) => a.role === "co_applicant").map(affordabilityIncomeOf)
  const childMaintenanceCents = applicants.filter((a) => a.role !== "guarantor").reduce((sum, a) => sum + (a.childMaintenanceCents ?? 0), 0)
  const { combinedIncome, ratio } = calculateCombinedAffordability(primary, coIncomes, rentCents)
  const declaredRatioPct = ratio == null ? null : Math.round(ratio * 100)
  const affordabilityTier = affordabilityTierOf(combinedIncome, ratio)

  // Obligations: summed across rent-sharing applicants (primary + co), only when actually declared.
  const obligationContributors = applicants.filter((a) => a.role !== "guarantor")
  const hasObligations = obligationContributors.some((a) => a.declaredObligationsCents != null)
  const declaredObligationsCents = obligationContributors.reduce((sum, a) => sum + (a.declaredObligationsCents ?? 0), 0)

  const randLeftAfterRentCents = combinedIncome > 0 ? combinedIncome - rentCents : null
  const randLeftAfterObligationsCents = hasObligations && combinedIncome > 0
    ? combinedIncome - rentCents - declaredObligationsCents
    : null
  const incomeMultiple = rentCents > 0 && combinedIncome > 0 ? Math.round((combinedIncome / rentCents) * 10) / 10 : null

  const primaryAloneClears = primary > 0 && rentCents > 0 && rentCents / primary <= INCOME_AFFORDABILITY_THRESHOLD
  const hasCoIncome = coIncomes.some((c) => c > 0)
  const coApplicantDependency = hasCoIncome && !primaryAloneClears && ratio != null && ratio <= MARGINAL_CEILING

  // Guarantor backstop — does ANY surety UNIT's pooled residual absorb the FULL rent? (See suretyUnitsCoverRent:
  // standalone guarantors never pool; only declared units — joint-&-several / in-community spouses — combine.)
  const guarantors = applicants.filter((a) => a.role === "guarantor")
  const hasGuarantor = guarantors.length > 0
  const guarantorBacksRent = suretyUnitsCoverRent(guarantors, rentCents)
  // s15(2)(h) MPA: an in-community surety-giver needs spousal CONSENT (co-signed via DocuSeal at signing). Validity,
  // separate from pooling. Surfaced here so the flow can require + route the witnessed consent before submit.
  const spousalConsentRequired = applicants.some((a) => a.role === "guarantor" && a.maritalRegime === "in_community")

  // Company verdict — the company is the PAYER (net profit ÷ 12 vs rent; turnover is context, never the number),
  // with the directors' combined surety (the guarantor units above) as the backstop. Mirrors the guarantor shape:
  // company nets it → strong; thin company but directors' surety carries the full rent → backstopped; neither → fail.
  const isCompany = opts.company != null
  const companyNetMonthlyCents = isCompany ? (opts.company?.netProfitMonthlyCents ?? null) : null
  const companyTurnoverMonthlyCents = isCompany ? (opts.company?.turnoverMonthlyCents ?? null) : null
  // Residual-style: weigh the rent against net profit ÷ 12 LESS the company's existing monthly commitments (other
  // leases, asset / vehicle finance, loans) — same shape as the personal residual.
  const companyCommitmentsCents = isCompany ? (opts.company?.monthlyCommitmentsCents ?? 0) : 0
  const companyResidualMonthlyCents = companyNetMonthlyCents != null ? companyNetMonthlyCents - companyCommitmentsCents : null
  const companyAffordsAlone = isCompany && companyResidualMonthlyCents != null && rentCents > 0 && companyResidualMonthlyCents >= rentCents
  let companyVerdict: CompanyVerdict | null = null
  if (isCompany) {
    if (companyAffordsAlone) companyVerdict = "strong"
    else if (guarantorBacksRent) companyVerdict = "backstopped" // directors' combined surety carries it
    else companyVerdict = "fail"
  }

  const depositCents = opts.depositCents ?? (rentCents > 0 ? rentCents : null)
  const estimatedMoveInCents = rentCents > 0 && depositCents != null ? depositCents + rentCents : null

  const identity = identitySignal(primaryApplicant, asOf)
  const employment = employmentSignal(primaryApplicant, asOf, opts.leaseTermMonths)
  const readiness = buildReadiness(applicants)

  // Documents: the primary's required/expected slots (itemised at /submit by listing what's uploaded).
  const documents = primaryApplicant?.documents ?? []
  const allRequiredDocsPresent = documents.filter((d) => d.required).every((d) => d.present)

  // Unified affordability outcome → the rollup/verdict. This is where the guarantor/company backstop actually
  // REACHES the verdict (not just the interpretation reads). See affordabilityOutcomeOf.
  const rollup = rollupOf(affordabilityOutcomeOf(isCompany, companyVerdict, affordabilityTier, guarantorBacksRent), readiness.allComplete, allRequiredDocsPresent)

  const base: Omit<FreeAssessmentResult, "interpretations"> = {
    primaryIncomeCents: primary,
    combinedIncomeCents: combinedIncome,
    childMaintenanceCents,
    declaredObligationsCents,
    declaredRatioPct,
    affordabilityTier,
    randLeftAfterRentCents,
    randLeftAfterObligationsCents,
    incomeMultiple,
    primaryAloneClears,
    coApplicantDependency,
    hasGuarantor,
    guarantorBacksRent,
    spousalConsentRequired,
    isCompany,
    companyNetMonthlyCents,
    companyTurnoverMonthlyCents,
    companyAffordsAlone,
    companyVerdict,
    companyAgeYears: isCompany ? (opts.company?.ageYears ?? null) : null,
    estimatedMoveInCents,
    identity,
    employment,
    documents,
    allRequiredDocsPresent,
    readiness,
    rollup,
  }

  return { ...base, interpretations: buildInterpretations(base) }
}
