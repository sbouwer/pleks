/**
 * lib/applications/companyRuling.ts — ADDENDUM_14O/14P deep-scan company affordability.
 *
 * COMPOSES the pure-personal evaluateRuling (kept untouched + RULING_VERSION-pinned) into a company-shaped verdict —
 * it never branches inside the personal engine. STRICT evidentiary model (14O §1): the company's DECLARED ledger /
 * surplus is NEVER credited to affordability — it rides as signal / confidence flags only. The verified basis is the
 * directors' SURETY (14O §2): does the directors' VERIFIED residual capacity back the rent on top of each one's own
 * obligations + household floor?
 *
 * Phase 0a credited a single verified director (the lead). Phase 0b (this version) is POOLING-CAPABLE: it takes a SET
 * of directors, runs evaluateRuling per director (adults:1 + that director's OWN dependents, §5.4), and computes all
 * three aggregations over the verified residual capacities — strongestSingle / combined / suretyGroupPooled — so the
 * agent sees every number. The DISPOSITIVE rule (which aggregation gates the verdict) is a counsel-bounded
 * `screening_policies` value passed in as `poolingRule`, NOT a constant here (14P §5). A single-director set behaves
 * exactly like 0a (pool of one).
 *
 * ⚠ §5.4 (correctness-critical): every director's evaluateRuling input MUST be scoped to adults:1 (+ that director's
 * OWN dependents) — co-directors are separate households, not dependents; reusing the company head count inflates the
 * floor and wrongly fails multi-director companies. The caller (screen route) owns that scoping.
 */
import { evaluateRuling, type RulingInput, type RulingResult, type RulingFlag, type RulingTier } from "./ruling"
import { formatZAR } from "@/lib/constants"

export const COMPANY_RULING_VERSION = "company-ruling.v0b"

/** The declared company payer block — companyOptionFrom's output (assembleAssessment). Signals only. */
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

/** A director's suretyship state (14P §5). Derived (is_surety_director + an executed-suretyship record), not inferred. */
export type SuretyState = "none" | "intended" | "executed"
/** The dispositive pooling rule — a counsel-bounded screening_policies value, NOT a constant (14P §5). */
export type PoolingRule = "strongestSingle" | "combined" | "suretyGroupPooled"

/** One director on the company application (14P §5). `input` is their adults:1-scoped personal ruling input. */
export interface DirectorSurety {
  ref: string                  // "primary" | "co_{coApplicantId}"
  input: RulingInput           // §5.4: adults:1 + this director's OWN dependents
  suretyState: SuretyState
  suretyGroup?: string | null  // pool within a group (spouses etc.)
  consented: boolean           // stage1_consent_given — the POPIA precondition to read/credit their docs
}

export interface CompanyRulingInput {
  /** The director set — directors[0] is the lead (its evaluateRuling drives the displayed affordability/confidence).
   *  A single-element set reproduces Phase 0a exactly. */
  directors: DirectorSurety[]
  /** companyOptionFrom output — DECLARED company figures. Signals only, never credited to affordability. */
  company: CompanyOption
  /** Step-1 company verdict — for the inversion read (signal only). */
  companyVerdict?: CompanyVerdict | null
  /** The dispositive aggregation (from screening_policies). Default = the most conservative (strongestSingle) until
   *  counsel sets the bound (14P §9). All three aggregations are computed + surfaced regardless. */
  poolingRule?: PoolingRule
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

type EvaluatedDirector = { d: DirectorSurety; base: RulingResult; capacityCents: number; credited: boolean }

/** A director's spare income they can put toward THIS rent, above their OWN floor + obligations:
 *  capacity = corroboratedIncome − obligations − floor = residualCents + rent − livingFloor (from the exposed fields).
 *  For a single director this is ≥ rent IFF residualCents ≥ livingFloor — i.e. 0a's backsRent, preserved. */
function directorCapacityCents(input: RulingInput, base: RulingResult): number {
  const { corroboratedIncomeCents, residualCents, livingFloorCents } = base.affordability
  if (corroboratedIncomeCents <= 0) return 0
  return residualCents + input.appliedRentCents - livingFloorCents
}

/** Max Σ-capacity within any surety_group (ungrouped directors are their own singleton group). */
function maxGroupCapacity(verified: EvaluatedDirector[]): number {
  const groups = new Map<string, number>()
  verified.forEach((e, i) => {
    const g = e.d.suretyGroup || `__solo_${i}`
    groups.set(g, (groups.get(g) ?? 0) + e.capacityCents)
  })
  return groups.size === 0 ? 0 : Math.max(0, ...groups.values())
}

/**
 * Company ruling (0b). affordability.* + confidence display come from the lead director (directors[0]); the verdict
 * tier is driven by whether the directors' VERIFIED surety pool (per the dispositive rule) backs the rent. Declared
 * company figures + the pool aggregations + the contingency are surfaced as flags only (never lift the verdict).
 */
export function evaluateCompanyRuling(input: CompanyRulingInput): RulingResult {
  const rentCents = input.directors[0]?.input.appliedRentCents ?? 0
  // Per-director VERIFIED rulings — only a consented, standing-surety director with corroborated income is credited
  // (strict model: declared ≠ credited; consent is the POPIA precondition to read their docs).
  const evaluated: EvaluatedDirector[] = input.directors.map((d) => {
    const base = evaluateRuling(d.input)
    const credited = d.consented && d.suretyState !== "none" && base.affordability.corroboratedIncomeCents > 0
    return { d, base, capacityCents: credited ? directorCapacityCents(d.input, base) : 0, credited }
  })
  const lead = evaluated[0]
  const verified = evaluated.filter((e) => e.credited)

  // Three aggregations over the VERIFIED capacities — all surfaced (transparency); the dispositive one gates.
  const strongestSingle = verified.length ? Math.max(0, ...verified.map((e) => e.capacityCents)) : 0
  const combined = verified.reduce((s, e) => s + e.capacityCents, 0)
  const suretyGroupPooled = maxGroupCapacity(verified)
  const configuredRule = input.poolingRule ?? "strongestSingle"
  // ⚠ LEGAL-COMPLIANCE GATE (14P §5): combined / suretyGroupPooled rely on the COMBINED security, which only exists
  // once EVERY credited surety's instrument is EXECUTED. Pre-execution (the deep-scan norm — all "intended") pooling
  // unexecuted security is the same defect that blocks `combined` pre-execution, so the dispositive rule collapses to
  // strongestSingle regardless of what the org configured. The configured rule only bites on a post-signing re-scan
  // (all executed). This lives here, not in the policy default, so unexecuted pooling can't slip through a config.
  const allExecuted = verified.length > 0 && verified.every((e) => e.d.suretyState === "executed")
  const rule: PoolingRule = allExecuted ? configuredRule : "strongestSingle"
  const poolByRule: Record<PoolingRule, number> = { strongestSingle, combined, suretyGroupPooled }
  const poolCapacity = poolByRule[rule]
  const backsRent = rentCents > 0 && poolCapacity >= rentCents
  // Contingency: the backing rests on a surety not yet EXECUTED (signed at lease signing, BUILD_69) → flagged, like
  // 14M spousal consent. At deep-scan time directors are essentially always "intended", so backed ⇒ contingent here.
  const contingent = backsRent && verified.some((e) => e.d.suretyState === "intended")

  // Tier: pool backs → up to strong, gated by the lead's verified-doc confidence; doesn't back → capped (an
  // unverified company claim can't read adequate/strong). 0a parity: a single director's pool = their own backsRent.
  const rulingTier: RulingTier = backsRent ? lead.base.confidence.tier : worseTier(lead.base.rulingTier, "needs-evidence")

  return {
    rulingVersion: `${COMPANY_RULING_VERSION}+${lead.base.rulingVersion}`, // composite — replay parses both
    rulingTier,
    affordability: lead.base.affordability, // lead's verified basis (display); declared company surplus NOT here (§6)
    confidence: lead.base.confidence,
    flags: [
      ...lead.base.flags,
      ...companySignalFlags(input.company, input.companyVerdict, rentCents, backsRent),
      ...suretyPoolFlags({ strongestSingle, combined, suretyGroupPooled, rule, configuredRule, allExecuted, poolCapacity, rentCents, backsRent, contingent, verified, evaluated }),
    ],
  }
}

/** The directors' surety pool → flags: the three aggregations (transparency), the dispositive read, the contingency,
 *  and a strict-continuity note for declared-but-unverified surety directors. */
function suretyPoolFlags(p: Readonly<{
  strongestSingle: number; combined: number; suretyGroupPooled: number; rule: PoolingRule; configuredRule: PoolingRule
  allExecuted: boolean; poolCapacity: number; rentCents: number; backsRent: boolean; contingent: boolean
  verified: EvaluatedDirector[]; evaluated: EvaluatedDirector[]
}>): RulingFlag[] {
  const flags: RulingFlag[] = []
  // 95 — the surety pool read. All three aggregations stated; the EFFECTIVE rule named. If the org configured a
  // pooling rule but it's deferred to execution (the legal gate), say so — the agent sees why combined isn't applied.
  const gated = p.configuredRule !== "strongestSingle" && !p.allExecuted
  const gateNote = gated ? ` The ${p.configuredRule} rule applies only once all sureties are executed (signed); pre-execution the strongest single is used.` : ""
  flags.push({
    id: 95, key: "company_director_surety_pool", axis: "affordability", severity: p.backsRent ? "positive" : "minor", type: "signal",
    title: `Directors' verified surety — strongest ${formatZAR(p.strongestSingle)}, combined ${formatZAR(p.combined)}, group ${formatZAR(p.suretyGroupPooled)}/mo; under the ${p.rule} rule it ${p.backsRent ? "backs" : "does not back"} the ${formatZAR(p.rentCents)} rent.${gateNote}`,
    remediation: null,
  })
  // 96 — the backing is CONTINGENT on an unexecuted suretyship instrument (signed at lease signing).
  if (p.contingent) {
    flags.push({ id: 96, key: "company_surety_contingent", axis: "stability", severity: "minor", type: "signal",
      title: "The directors' surety backing is contingent — the suretyship instrument is not yet executed (signed at lease signing). The credited reading firms up once signed.", remediation: null })
  }
  // 97 — declared-only surety directors (consent/documents missing) are NOT credited (strict continuity).
  const declaredOnly = p.evaluated.filter((e) => !e.credited && e.d.suretyState !== "none").length
  if (declaredOnly > 0) {
    flags.push({ id: 97, key: "company_surety_unverified", axis: "confidence", severity: "minor", type: "signal",
      title: `${declaredOnly} surety director${declaredOnly === 1 ? " is" : "s are"} declared only (consent or documents outstanding) — not credited until verified.`, remediation: null })
  }
  return flags
}

/** Declared company figures → SIGNAL / confidence flags (never affordability inputs). Mirrors the Step-1
 *  companyLedgerReads rules (owner comp = owner_remuneration ONLY; ratio pre owner comp; relocate-gated premises). */
function companySignalFlags(c: CompanyOption, companyVerdict: CompanyVerdict | null | undefined, rentCents: number, backsRent: boolean): RulingFlag[] {
  const surplus = c.netProfitMonthlyCents ?? 0
  const turnover = c.turnoverMonthlyCents ?? 0
  const ownerComp = c.ownerCompMonthlyCents ?? 0
  const premisesRent = c.premisesRentMonthlyCents ?? 0
  const flags: RulingFlag[] = []

  // ALWAYS — the strict-model declared-capacity flag (14O §2/§5.3): the company's own capacity is unverified.
  flags.push({ id: 90, key: "company_capacity_declared", axis: "confidence", severity: "minor", type: "signal",
    title: "Company financial capacity is declared only. Business-bank and/or financial-statement verification has not yet been completed.", remediation: null })

  // Declared surplus as a SIGNAL (never credited). Inversion: declared-affords but the verified surety doesn't back it.
  if (surplus !== 0) {
    const inversion = !backsRent && (companyVerdict === "strong" || surplus >= rentCents)
    flags.push({ id: 91, key: "company_surplus_declared", axis: "affordability", severity: inversion ? "minor" : "positive", type: "signal",
      title: inversion
        ? `Declared company surplus (${formatZAR(surplus)}/mo) suggests the company affords the rent, but the directors' VERIFIED surety does not yet back it — request business-bank / AFS evidence.`
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
