/**
 * lib/applications/ruling.ts — the affordability prescreen RULING (ADDENDUM_14M)
 *
 * Pure, deterministic, versioned (`RULING_VERSION`) — no AI, no I/O, `now` injected. Layers a two-axis ruling
 * ON TOP of the 14L `ReconciliationResult` + the declared income/rent (it does NOT replace lib/applications/
 * prescreen.ts). Determinism keeps the FitScore/POPIA-s71 replay posture intact (bump RULING_VERSION on any
 * logic change). NEVER auto-rejects — it produces a coachable to-do list + the full picture; the human decides.
 *
 * Two axes (§2): Affordability (declared income vs rent vs 0.30, with the flag-0 demonstrated-payment
 * override) × Confidence (is the income recent/complete/own-name/corroborated). Flags 0–8 (§3) are live;
 * 10–13 are a 14L fast-follow. Fixable flags carry a source-type-aware best-evidence prompt (§4); Signal
 * flags are agent-facing (no applicant "make it disappear" to-do).
 *
 * DEEP-SCAN FOLLOW-UP (not built): MARITAL CROSS-CHECK — compare the applicant's DECLARED marital status against the
 * bureau/credit-check-confirmed status. Declared "unmarried" but the check confirms married → raise a SIGNAL flag
 * (mis-declaration / undisclosed joint estate; bears on s15 surety-consent validity). Declared-then-verified, same
 * as every other field. See memory project_pleks_marital_surety_consent.
 */
import { INCOME_AFFORDABILITY_THRESHOLD, startedWithinProbation, PROBATION_MONTHS } from "@/lib/constants"
import type { ReconciliationResult } from "@/lib/extraction/types"
import { householdLivingFloorCents, LIVING_FLOOR } from "./livingFloor"

export const RULING_VERSION = "ruling.v3"  // v3: flag 0b residual-income override + residual-override tier

const MARGINAL_CEILING = 0.35       // 0.31–0.35 → near-miss (surface paths), > 0.35 → below
const STALE_DAYS = 35               // most-recent document older than this → flag 3
const HOUSING_MIN_MONTHS = 6        // flag 0 requires a SUSTAINED history…
const SALARIED_MIN_MONTHS = 3       // flag 4 quantity (salaried)
const VARIABLE_MIN_MONTHS = 6       // …and 6 for commission / self-employed

export type AffordabilityTier = "within" | "marginal" | "below" | "demonstrated-override" | "residual-override"
export type ConfidenceTier = "strong" | "adequate" | "needs-evidence"
export type RulingTier = "strong" | "adequate" | "needs-evidence" | "below-threshold"
export type FlagSeverity = "block" | "major" | "minor" | "positive"
export type FlagType = "fixable" | "signal" | "override" | "structural"

export interface RulingFlag {
  id: number                 // 14M §3 catalogue number
  key: string
  axis: "affordability" | "confidence" | "stability" | "integrity" | "risk"
  severity: FlagSeverity
  type: FlagType
  title: string
  remediation: string | null // applicant-facing best-evidence prompt; null for Signal flags
}

export interface RulingResult {
  rulingVersion: string
  rulingTier: RulingTier
  affordability: {
    ratioPct: number | null; tier: AffordabilityTier; demonstratedHousingCents: number | null
    /** Verified-income view: rent ÷ CORROBORATED income (sum of evidenced sources; uncorroborated counts 0).
     *  Shown beside the declared ratio so phantom uncorroborated income can't visually carry affordability, and
     *  the base figure for flag 0b's residual override. (ADDENDUM_14M #3) */
    corroboratedIncomeCents: number; corroboratedRatioPct: number | null
  }
  confidence: { tier: ConfidenceTier }
  flags: RulingFlag[]
}

export interface RulingInput {
  appliedRentCents: number
  declaredMonthlyIncomeCents: number   // sum of the declared income sources (monthly)
  employmentType: string | null
  employmentStartDate: string | null
  reconciliation: ReconciliationResult
  now: Date
  adults?: number            // household EARNER adults (applicant + co-applicants); defaults to 1
  adultDependents?: number   // adult dependants supported — full living-floor cost (a whole adult head)
  minorDependents?: number   // minor (child) dependants — half cost. Both feed flag 0b's living floor.
  schoolFeesCents?: number   // declared child-specific cost — part of the child bucket (offset by maintenance)
  childMaintenanceCents?: number  // child maintenance RECEIVED (declared, monthly) — earmarked for the child:
                                  // excluded from rent-payable income AND offsets the child's living-floor cost
                                  // (once, capped at that cost). Spousal/alimony stays income (not this field).
}

const isVariable = (t: string | null): boolean => t === "commission" || t === "self_employed" || t === "freelance"

/** Source-type-aware best-evidence prompt for an uncorroborated declared source (§4). */
function evidencePrompt(key: string, employmentType: string | null): string {
  if (key === "employment") {
    if (employmentType === "commission") return "Upload 6 months' bank statements plus your commission/payslip statements."
    if (employmentType === "self_employed" || employmentType === "freelance") return "Upload 6 months' business and personal bank statements plus your SARS Tax Compliance Status (good standing) or ITA34."
    return "Upload your latest payslip, 3 months' bank statements, and an employment contract or letter of appointment."
  }
  switch (key) {
    case "business":        return "Upload 6 months' business and personal bank statements plus your SARS Tax Compliance Status (good standing) or ITA34."
    case "rental":          return "Upload the bank account that receives the rent, or a signed lease."
    case "dividends":       return "Upload your broker or investment-account statement."
    case "savings_interest":return "Upload your savings-account statement."
    case "pension":         return "Upload your latest pension / annuity advice slip, or the account that receives it."
    case "grant":           return "Upload your SASSA grant approval letter or card, plus the account it's paid into."
    case "alimony":
    case "maintenance":     return "Upload the court order and the bank account that receives the payments."
    default:                return "Upload the bank account that receives this income."
  }
}

/** Flag 0 — demonstrated recurring own-name housing payment. Override requires SUSTAINED (≥6 months) AND CLEAN
 *  (no missed/returned) AND covering the applied rent. (Fix #1: guards beyond mere detection.) */
function housingOverride(input: RulingInput): { override: boolean; flag: RulingFlag | null; demonstrated: number | null } {
  const h = input.reconciliation.housingPayment
  if (!h.detected || h.recurring_monthly_cents == null) return { override: false, flag: null, demonstrated: null }
  const sustained = h.months_observed >= HOUSING_MIN_MONTHS && !h.anyMissedOrReturned
  const covers = h.recurring_monthly_cents >= input.appliedRentCents
  if (sustained && covers) {
    return {
      override: true,
      demonstrated: h.recurring_monthly_cents,
      flag: { id: 0, key: "demonstrated_housing", axis: "affordability", severity: "positive", type: "override", title: `Proven housing payment of ${(h.recurring_monthly_cents / 100).toFixed(0)} for ${h.months_observed} months`, remediation: null },
    }
  }
  return { override: false, flag: null, demonstrated: h.recurring_monthly_cents }
}

function affordabilityFlag(ratio: number, tier: AffordabilityTier): RulingFlag | null {
  if (tier === "within" || tier === "demonstrated-override") return null
  const severity: FlagSeverity = tier === "below" ? "block" : "minor"
  return {
    id: 1, key: "affordability", axis: "affordability", severity, type: "structural",
    title: `Rent is ${ratio}% of declared income (guideline is ${Math.round(INCOME_AFFORDABILITY_THRESHOLD * 100)}%)`,
    remediation: "Add an earning co-applicant, offer a larger deposit or a guarantor — or supply a rent/bond payment history that proves you sustain this amount.",
  }
}

function probationFlag(input: RulingInput): RulingFlag | null {
  if (!startedWithinProbation(input.employmentStartDate, input.now)) return null
  return {
    id: 2, key: "probation", axis: "stability", severity: "minor", type: "fixable",
    title: `Started under ${PROBATION_MONTHS} months ago — possibly still in a probation period`,
    remediation: "Upload your employment contract or letter of appointment (it also substantiates your salary).",
  }
}

function recencyFlags(input: RulingInput): RulingFlag[] {
  const out: RulingFlag[] = []
  const r = input.reconciliation.recency
  if (r.mostRecentWithinDays != null && r.mostRecentWithinDays > STALE_DAYS) {
    out.push({ id: 3, key: "stale_documents", axis: "confidence", severity: "major", type: "fixable", title: "Your most recent document is over a month old", remediation: "Upload a current-month bank statement or payslip." })
  }
  const need = isVariable(input.employmentType) ? VARIABLE_MIN_MONTHS : SALARIED_MIN_MONTHS
  if (r.monthsCovered.length > 0 && (r.salariedMonthsCovered < need || !r.consecutive)) {
    out.push({ id: 4, key: "insufficient_quantity", axis: "confidence", severity: "major", type: "fixable", title: `We need ${need} consecutive recent months of statements`, remediation: "Upload additional consecutive monthly statements." })
  }
  return out
}

function declaredSourceFlags(input: RulingInput): RulingFlag[] {
  const out: RulingFlag[] = []
  for (const s of input.reconciliation.declaredSources) {
    if (s.status === "uncorroborated" || s.status === "no-evidence") {
      out.push({ id: 5, key: `uncorroborated:${s.source_key}`, axis: "confidence", severity: "major", type: "fixable", title: `We couldn't corroborate your declared ${s.label.toLowerCase()}`, remediation: evidencePrompt(s.source_key, input.employmentType) })
    } else if (s.status === "variance" && s.declared_monthly_cents != null && s.evidenced_monthly_cents != null && s.declared_monthly_cents > s.evidenced_monthly_cents) {
      // Only OVER-declaration (declared > documented) is a confidence concern. UNDER-declaration (documents show
      // MORE than declared) is conservative and fully supported, so it's left unflagged — treated as corroborated.
      // Coach the EVIDENCE, not the number (no "revise the figure" — that nudges gaming, 14M guardrail #3).
      out.push({ id: 6, key: `variance:${s.source_key}`, axis: "confidence", severity: "major", type: "fixable", title: `Your declared ${s.label.toLowerCase()} is higher than your documents show`, remediation: "We substantiate at the lower (documented) figure. To support the higher amount, upload statements covering a longer period (e.g. 6 months)." })
    }
  }
  return out
}

function integrityFlags(input: RulingInput): RulingFlag[] {
  const out: RulingFlag[] = []
  const id = input.reconciliation.identity
  // Identity mismatch is GRADED. This applicant-facing flag is NOT the fraud wall — DHA identity verification
  // (Searchworx) runs downstream and a re-upload of name-matching docs still hits it. So this flag's job is to let
  // an HONEST mix-up be re-checked, worded neutrally so it never names the matching mechanism or how to clear it
  // (14M guardrail #3). The agent-side surface keeps a PERSISTENT integrity record regardless of re-uploads.
  if (id.idNumber === "mismatch" || id.name === "material-mismatch") {
    // HARD mismatch — different surname or a different ID number. Real integrity signal → major (→ needs-evidence).
    // Soft wording — no implied hard gate (nothing blocks submit but email-OTP; the agent decides — shows-all /
    // never-auto-reject). States the agent MAY verify, without naming the matching mechanism.
    out.push({ id: 7, key: "identity_mismatch", axis: "integrity", severity: "major", type: "fixable", title: "We couldn't confirm these documents belong to you", remediation: "Please double-check that the documents you uploaded are your own. Your agent may ask you to verify your identity." })
  } else if (id.name === "minor-variation") {
    // SOFT variation — initials vs full name, maiden/married surname, an extra middle name. Almost always innocent.
    out.push({ id: 7, key: "identity_soft_variation", axis: "integrity", severity: "minor", type: "fixable", title: "The name on your documents differs slightly from your application", remediation: "If you've recently changed your name (e.g. marriage) or used initials, that's fine — just check the spelling matches." })
  }
  if (input.reconciliation.netPayVsCredit.verdict === "gap") {
    // Flag 8 — risk SIGNAL for the agent (garnishee / salary into another account); not an applicant to-do.
    out.push({ id: 8, key: "net_vs_credit_gap", axis: "risk", severity: "major", type: "signal", title: "Net pay on the payslip differs from the recurring salary credit", remediation: null })
  }
  return out
}

function confidenceTierOf(flags: RulingFlag[]): ConfidenceTier {
  const confFlags = flags.filter((f) => f.axis === "confidence" || f.axis === "integrity")
  if (confFlags.some((f) => f.severity === "major" || f.severity === "block")) return "needs-evidence"
  if (flags.some((f) => f.severity === "minor" && f.type === "fixable")) return "adequate"
  return "strong"
}

function affordabilityTierOf(override: boolean, ratioPct: number | null): AffordabilityTier {
  if (override) return "demonstrated-override"
  if (ratioPct == null) return "below"                                  // income <= 0
  if (ratioPct <= INCOME_AFFORDABILITY_THRESHOLD * 100) return "within"
  if (ratioPct <= MARGINAL_CEILING * 100) return "marginal"
  return "below"
}

function affordabilityFlagFor(override: boolean, income: number, ratioPct: number | null, tier: AffordabilityTier): RulingFlag | null {
  if (override) return null
  if (income <= 0) return { id: 1, key: "affordability", axis: "affordability", severity: "block", type: "structural", title: "No income declared to assess affordability", remediation: "Add an earning co-applicant or guarantor, or declare your income." }
  return ratioPct != null ? affordabilityFlag(ratioPct, tier) : null
}

export function evaluateRuling(input: RulingInput): RulingResult {
  // Child maintenance RECEIVED is earmarked for the child — single-place accounting: it is NEVER rent-payable
  // income (excluded from both declared + corroborated income, so the ratio is rent ÷ salary, never inflated and
  // never penalised below salary), and it offsets the child's living-floor cost ONCE, capped at that cost so
  // surplus maintenance can't leak back as phantom affordability.
  const declaredChildMaintCents = Math.max(0, input.childMaintenanceCents ?? 0)
  const income = Math.max(0, input.declaredMonthlyIncomeCents - declaredChildMaintCents)
  const { override, flag: overrideFlag, demonstrated } = housingOverride(input)
  const ratioPct = income > 0 ? Math.round((input.appliedRentCents / income) * 100) : null
  const affordabilityTier = affordabilityTierOf(override, ratioPct)

  // Corroborated (verified) income = sum of evidenced amounts across sources EXCEPT child maintenance; the
  // verified maintenance offsets the floor instead (below). Uncorroborated/no-evidence count 0.
  const corroboratedIncomeCents = input.reconciliation.declaredSources
    .filter((s) => s.source_key !== "maintenance")
    .reduce((sum, s) => sum + (s.evidenced_monthly_cents ?? 0), 0)
  const corroboratedChildMaintCents = input.reconciliation.declaredSources
    .filter((s) => s.source_key === "maintenance")
    .reduce((sum, s) => sum + (s.evidenced_monthly_cents ?? 0), 0)
  const corroboratedRatioPct = corroboratedIncomeCents > 0 ? Math.round((input.appliedRentCents / corroboratedIncomeCents) * 100) : null

  const flags: RulingFlag[] = []
  if (overrideFlag) flags.push(overrideFlag)

  // Flag 0b — residual-income override. A marginal/below RATIO is overridden when VERIFIED income covers rent +
  // observed obligations with at least the household living floor (PMBEJD) left over. A residual floor, not income
  // bands (a floor self-scales). Only ever RAISES affordability; corroboration-weighted (uncorroborated income
  // counts 0, so it can't pass phantom affordability) and surfaced-not-determinative — so it can't auto-harm.
  const obligationsCents = input.reconciliation.observedObligationsCents ?? 0
  const residualCents = corroboratedIncomeCents - input.appliedRentCents - obligationsCents
  // The child's cost sits in the living floor (R/dependent); verified child maintenance offsets it ONCE, capped
  // at that cost (never below the adult-only floor; surplus maintenance vanishes — it can't lower the bar further).
  const minorCount = Math.max(0, input.minorDependents ?? 0)
  const adultHeads = (input.adults ?? 1) + Math.max(0, input.adultDependents ?? 0)
  // Child bucket = minor living-floor share + declared child-specific costs (school fees). Maintenance RECEIVED
  // offsets the WHOLE bucket once, capped (net ≥ 0; surplus vanishes). Adults' general living stays in the adult
  // floor; commitments (the Expenses grid) sit in obligations, not here — each cost counted exactly once.
  const childBucketCents = minorCount * LIVING_FLOOR.perMinorCents + Math.max(0, input.schoolFeesCents ?? 0)
  const netChildCostCents = Math.max(0, childBucketCents - corroboratedChildMaintCents)
  const livingFloorCents = householdLivingFloorCents(adultHeads, 0) + netChildCostCents
  const residualOverride = corroboratedIncomeCents > 0
    && (affordabilityTier === "marginal" || affordabilityTier === "below")
    && residualCents >= livingFloorCents
  const effectiveTier: AffordabilityTier = residualOverride ? "residual-override" : affordabilityTier
  if (residualOverride) {
    flags.push({ id: 0, key: "residual_override", axis: "affordability", severity: "positive", type: "override",
      title: `Verified income covers rent + obligations with ~R${Math.round(residualCents / 100)}/mo to spare — above the household living floor (R${Math.round(livingFloorCents / 100)})`,
      remediation: null })
  }

  const affFlag = affordabilityFlagFor(override || residualOverride, income, ratioPct, effectiveTier)
  if (affFlag) flags.push(affFlag)
  const probation = probationFlag(input)
  if (probation) flags.push(probation)
  flags.push(...recencyFlags(input), ...declaredSourceFlags(input), ...integrityFlags(input))

  const confidence = confidenceTierOf(flags)
  const affordabilityBlocked = effectiveTier === "below" && !override
  let rulingTier: RulingTier = affordabilityBlocked ? "below-threshold" : confidence
  // A marginal ratio can't read "strong" — Strong requires a clear ratio or an override.
  if (effectiveTier === "marginal" && rulingTier === "strong") rulingTier = "adequate"

  return {
    rulingVersion: RULING_VERSION,
    rulingTier,
    affordability: { ratioPct, tier: effectiveTier, demonstratedHousingCents: demonstrated, corroboratedIncomeCents, corroboratedRatioPct },
    confidence: { tier: confidence },
    flags,
  }
}
