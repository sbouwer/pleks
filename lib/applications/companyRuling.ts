/**
 * lib/applications/companyRuling.ts — ADDENDUM_14O Phase 0a: deep-scan company affordability.
 *
 * COMPOSES the pure-personal evaluateRuling (kept untouched + RULING_VERSION-pinned) into a company-shaped verdict —
 * it never branches inside the personal engine. STRICT evidentiary model (14O §1): the company's DECLARED ledger /
 * surplus is NEVER credited to affordability — it rides as signal / confidence flags only. The verified basis is the
 * SINGLE lead-director residual read as a SURETY test (14O §2): does the lead director's VERIFIED residual back the
 * full rent on top of their own obligations + household floor? Other directors are declared signals (0b verifies
 * them per-subject); business-bank premises + AFS verification are Phase 1 / 2.
 *
 * ⚠ §5.4 (correctness-critical): the lead-director evaluateRuling input MUST be scoped to adults:1 (+ the lead
 * director's OWN dependents) — co-directors are separate households, not dependents; reusing applicantCount inflates
 * the living floor and wrongly fails multi-director companies. The screen route owns that scoping.
 */
import { evaluateRuling, type RulingInput, type RulingResult, type RulingFlag, type RulingTier } from "./ruling"
import { formatZAR } from "@/lib/constants"

export const COMPANY_RULING_VERSION = "company-ruling.v0a"

/** The declared company payer block — companyOptionFrom's output (assembleAssessment). Signals only in 0a. */
export interface CompanyOption {
  netProfitMonthlyCents: number | null
  turnoverMonthlyCents?: number | null
  monthlyCommitmentsCents?: number | null
  ownerCompMonthlyCents?: number | null
  premisesRentMonthlyCents?: number | null
  premisesMove?: string | null
  figuresSource?: string | null
  afsYear?: string | null
  ageYears?: number | null
}
export type CompanyVerdict = "strong" | "backstopped" | "fail"

export interface CompanyRulingInput {
  /** The LEAD DIRECTOR's personal ruling input — MUST be scoped to adults:1 + their OWN dependents (§5.4). */
  leadDirector: RulingInput
  /** companyOptionFrom output — DECLARED company figures. Signals only, never credited to affordability. */
  company: CompanyOption
  /** Step-1 company verdict — for the inversion read (signal only). */
  companyVerdict?: CompanyVerdict | null
}

const TIER_ORDER: RulingTier[] = ["below-threshold", "needs-evidence", "adequate", "strong"]
function worseTier(a: RulingTier, b: RulingTier): RulingTier {
  return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b
}

/** Years between the declared AFS financial year and now (null if unknown); "older" → 4. */
function afsStaleYears(afsYear?: string | null): number | null {
  if (!afsYear) return null
  if (afsYear === "older") return 4
  const y = Number(afsYear)
  return Number.isFinite(y) ? new Date().getFullYear() - y : null
}

/**
 * Phase 0a company ruling. affordability.* + the tier reflect the VERIFIED lead-director surety basis; the company's
 * declared figures are added as flags only (never lifting the verdict — 14O §6).
 */
export function evaluateCompanyRuling(input: CompanyRulingInput): RulingResult {
  // 1. Verified basis — the lead director's personal ruling (adults:1-scoped by the caller, §5.4).
  const base = evaluateRuling(input.leadDirector)
  const { corroboratedIncomeCents, residualCents, livingFloorCents } = base.affordability

  // 2. Surety test (§2.3/§6) — the determinant is the residual INEQUALITY, not the tier string (a high-income
  //    director clears the rent and reads tier "within", never "residual-override", yet still backs the rent).
  const backsRent = corroboratedIncomeCents > 0 && residualCents >= livingFloorCents

  // 3. Map the tier on backsRent. Declared company figures never lift it (§6); when the verified director does NOT
  //    back the rent, a company eval cannot read adequate/strong on an unverified company claim → cap at
  //    needs-evidence (below-threshold stays). When they do back it, the verified personal tier carries (up to strong).
  const rulingTier = backsRent ? base.rulingTier : worseTier(base.rulingTier, "needs-evidence")

  return {
    rulingVersion: `${COMPANY_RULING_VERSION}+${base.rulingVersion}`, // composite — replay parses both (§3/§10)
    rulingTier,
    affordability: base.affordability, // verified lead-director basis (display); declared company surplus NOT here (§6)
    confidence: base.confidence,
    flags: [...base.flags, ...companySignalFlags(input, input.leadDirector.appliedRentCents, backsRent)],
  }
}

/** Declared company figures → SIGNAL / confidence flags (never affordability inputs). Mirrors the Step-1
 *  companyLedgerReads rules (owner comp = owner_remuneration ONLY; ratio pre owner comp; relocate-gated premises). */
function companySignalFlags(input: CompanyRulingInput, rentCents: number, backsRent: boolean): RulingFlag[] {
  const c = input.company
  const surplus = c.netProfitMonthlyCents ?? 0
  const turnover = c.turnoverMonthlyCents ?? 0
  const ownerComp = c.ownerCompMonthlyCents ?? 0
  const premisesRent = c.premisesRentMonthlyCents ?? 0
  const flags: RulingFlag[] = []

  // ALWAYS — the strict-model declared-capacity flag (14O §2/§5.3): the company's own capacity is unverified.
  flags.push({ id: 90, key: "company_capacity_declared", axis: "confidence", severity: "minor", type: "signal",
    title: "Company financial capacity is declared only. Business-bank and/or financial-statement verification has not yet been completed.", remediation: null })

  // Declared surplus as a SIGNAL (never credited). Inversion: declared-affords but the verified director doesn't back it.
  if (surplus !== 0) {
    const inversion = !backsRent && (input.companyVerdict === "strong" || surplus >= rentCents)
    flags.push({ id: 91, key: "company_surplus_declared", axis: "affordability", severity: inversion ? "minor" : "positive", type: "signal",
      title: inversion
        ? `Declared company surplus (${formatZAR(surplus)}/mo) suggests the company affords the rent, but the lead director's VERIFIED residual does not yet back it — request business-bank / AFS evidence.`
        : `Declared company cash surplus ${formatZAR(surplus)}/mo (unverified — corroborated at the deep scan).`,
      remediation: null })
  }

  // Owner-managed — thin surplus rescued by owner drawings (owner_remuneration ONLY) → capacity sits on the director.
  if (ownerComp > 0 && surplus < rentCents && surplus + ownerComp >= rentCents) {
    flags.push({ id: 92, key: "company_owner_managed", axis: "confidence", severity: "minor", type: "signal",
      title: `Thin company surplus because ${formatZAR(ownerComp)}/mo is drawn as owner remuneration — capacity sits on the director's side (the surety basis), not the company line.`, remediation: null })
  }

  // Cash-extraction ratio computed PRE owner comp — a salaried owner must not read as a low-margin business.
  if (turnover > 0 && (surplus + ownerComp) / turnover < 0.05) {
    flags.push({ id: 93, key: "company_thin_margin", axis: "confidence", severity: "minor", type: "signal",
      title: "Even before owner drawings, the company keeps very little of its turnover — a thin operating margin to verify against the AFS.", remediation: null })
  }

  // AFS staleness.
  const stale = afsStaleYears(c.afsYear)
  if (stale != null && stale >= 2) {
    flags.push({ id: 94, key: "company_afs_stale", axis: "confidence", severity: "minor", type: "signal",
      title: `Company figures are from a financial year about ${stale} years old — confirm current consistency against bank statements at the deep scan.`, remediation: null })
  }

  // Flag 9 — relocate-gated DECLARED premises payment (positive signal; the bank-verified override is Phase 1).
  if (c.premisesMove === "relocate" && premisesRent > 0 && rentCents > 0 && premisesRent >= rentCents) {
    flags.push({ id: 9, key: "company_premises_declared", axis: "affordability", severity: "positive", type: "signal",
      title: `The company declares it already pays ${formatZAR(premisesRent)}/mo in premises rent and is relocating — at or above the ${formatZAR(rentCents)} applied (declared; bank-verified override is Phase 1).`, remediation: null })
  }

  return flags
}
