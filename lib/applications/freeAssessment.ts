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

const MARGINAL_CEILING = 0.35

export type DeclaredAffordabilityTier = "within" | "marginal" | "below" | "no-income"
export type ReadinessBand = "ready" | "partial" | "incomplete"
export type Residency = "citizen" | "permanent_resident" | "foreign" | "unknown"
/** The Step-1 roll-up — an administrative "is this worth a deep scan?" state, the triage-list sort key.
 *  Reds (does-not-qualify, incomplete) sort above amber (missing-docs) above green (verify-ready). */
export type Step1Status = "verify-ready" | "missing-docs" | "does-not-qualify" | "incomplete"

/** A required/expected document slot + whether the applicant has uploaded SOMETHING for it (presence, NOT proof
 *  of contents — "uploaded, unverified"). */
export interface DocSlot { key: string; label: string; required: boolean; present: boolean }

export interface FreeApplicantInput {
  role: "primary" | "co_applicant" | "guarantor"
  declaredIncomeCents: number
  declaredObligationsCents?: number | null  // existing monthly debits/commitments, if declared
  idType: string | null
  idNumber: string | null
  declaredDob?: string | null         // separately-declared DOB (YYYY-MM-DD) — for the ID cross-check
  employmentStartDate?: string | null // for tenure + probation (primary only today)
  documentsUploaded?: boolean         // any docs at all (co-applicant readiness); undefined = unknown
  documents?: DocSlot[]               // itemised slots (primary) — powers the documents checklist
  complete: boolean                   // finished their part (identity + income + docs + consent)
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
}

export type InterpretationKind = "positive" | "caution" | "action"
export interface Interpretation { kind: InterpretationKind; text: string }

export interface FreeAssessmentResult {
  // Affordability (declared / unverified)
  primaryIncomeCents: number
  combinedIncomeCents: number          // primary + co-applicants (guarantors excluded)
  declaredObligationsCents: number     // summed across primary + co-applicants
  declaredRatioPct: number | null      // rent ÷ combined income, on STATED figures
  affordabilityTier: DeclaredAffordabilityTier
  randLeftAfterRentCents: number | null
  randLeftAfterObligationsCents: number | null  // null if no obligations were declared
  incomeMultiple: number | null        // combined income ÷ rent (×, 1 dp)
  primaryAloneClears: boolean          // does the primary alone clear the 30% guideline?
  coApplicantDependency: boolean       // affordable only on the combined income (single-income risk)
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
  asOf?: Date                          // for deterministic age/tenure in tests
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

function employmentSignal(primary: FreeApplicantInput | undefined, asOf: Date): EmploymentSignal {
  const start = primary?.employmentStartDate ? new Date(primary.employmentStartDate) : null
  if (!start || Number.isNaN(start.getTime())) return { tenureMonths: null, recentlyStarted: false }
  return {
    tenureMonths: Math.max(0, monthsBetween(start, asOf)),
    recentlyStarted: startedWithinProbation(primary?.employmentStartDate, asOf),
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

  // Affordability read (one, by tier)
  if (r.affordabilityTier === "no-income") {
    out.push({ kind: "action", text: "No income declared — can't assess affordability. Capture income before shortlisting." })
  } else if (r.affordabilityTier === "within" && ready && goodMultiple) {
    out.push({ kind: "positive", text: "Strong on paper: affordable and complete. Good candidate for a deep scan." })
  } else if (r.affordabilityTier === "within") {
    out.push({ kind: "positive", text: "Affordable on declared income (within the 30% guideline)." })
  } else if (r.affordabilityTier === "marginal") {
    out.push({ kind: "caution", text: "Slightly over the 30% guideline — affordable if income verifies; a co-applicant or larger deposit would strengthen it." })
  } else if (r.coApplicantDependency) {
    out.push({ kind: "caution", text: "Only affordable on the combined income — single-income risk if one tenant leaves." })
  } else {
    out.push({ kind: "caution", text: "Rent is high relative to declared income — affordability concern." })
  }

  if (r.employment.recentlyStarted) {
    out.push({ kind: "caution", text: `Less than ${PROBATION_MONTHS} months in the current role — employment not yet established.` })
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
function rollupOf(tier: DeclaredAffordabilityTier, allComplete: boolean, allRequiredDocsPresent: boolean): Step1Status {
  if (tier === "below" || tier === "no-income") return "does-not-qualify"
  if (!allComplete) return "incomplete"
  if (!allRequiredDocsPresent) return "missing-docs"
  return "verify-ready"
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

  // Affordability: co-applicants share the rent → summed; guarantors are a backstop → excluded.
  const primaryApplicant = applicants.find((a) => a.role === "primary")
  const primary = primaryApplicant?.declaredIncomeCents ?? 0
  const coIncomes = applicants.filter((a) => a.role === "co_applicant").map((a) => a.declaredIncomeCents)
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

  const depositCents = opts.depositCents ?? (rentCents > 0 ? rentCents : null)
  const estimatedMoveInCents = rentCents > 0 && depositCents != null ? depositCents + rentCents : null

  const identity = identitySignal(primaryApplicant, asOf)
  const employment = employmentSignal(primaryApplicant, asOf)
  const readiness = buildReadiness(applicants)

  // Documents: the primary's required/expected slots (itemised at /submit by listing what's uploaded).
  const documents = primaryApplicant?.documents ?? []
  const allRequiredDocsPresent = documents.filter((d) => d.required).every((d) => d.present)
  const rollup = rollupOf(affordabilityTier, readiness.allComplete, allRequiredDocsPresent)

  const base: Omit<FreeAssessmentResult, "interpretations"> = {
    primaryIncomeCents: primary,
    combinedIncomeCents: combinedIncome,
    declaredObligationsCents,
    declaredRatioPct,
    affordabilityTier,
    randLeftAfterRentCents,
    randLeftAfterObligationsCents,
    incomeMultiple,
    primaryAloneClears,
    coApplicantDependency,
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
