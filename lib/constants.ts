/**
 * lib/constants.ts — App-wide constants: tier model, pricing, org/lease enums, and ZAR formatters
 *
 * Notes:  TIER_ORDER/TIER_LIMITS/TIER_PRICING drive canActivateLease and subscription gating.
 *         No annual pricing — monthly only. Bespoke is a real tier (monthly base + per-lease
 *         pricing, enterprise, year 2+). No seat caps. No overage charges; activation is
 *         blocked at the lease cap and the user is prompted to upgrade.
 */
/** Re-exported from the env SSOT so existing `@/lib/constants` importers keep working (centralisation item 3). */
export { APP_URL } from "@/lib/env"

/**
 * SA prime lending rate = SARB repo rate + this spread. Fixed at 3.50% by SARB/banking convention
 * (the Reserve Bank sets the spread; it has been 3.5% since 2008). prime-rate-sync adds it to the repo
 * rate from the rate feed. If SARB ever changes the spread, update it HERE (single source of truth) —
 * it is load-bearing (drives arrears interest), so it must never be a magic number buried in a cron.
 */
export const SA_PRIME_REPO_SPREAD = 3.5

export const TIER_ORDER = { owner: 0, steward: 1, growth: 2, portfolio: 3, firm: 4, bespoke: 5 } as const
export type Tier = keyof typeof TIER_ORDER

// Maximum active leases per tier. null = unlimited (custom/bespoke contract).
export const TIER_LIMITS = {
  owner:     { leases: 1 },
  steward:   { leases: 15 },
  growth:    { leases: 30 },
  portfolio: { leases: 75 },
  firm:      { leases: 150 },
  bespoke:   { leases: null },
} as const

// Monthly pricing in cents only — no annual option.
// Bespoke: monthly base + per-lease charge; pricing agreed on contract, null here.
export const TIER_PRICING = {
  owner:     { monthly: 0 },
  steward:   { monthly: 69900 },
  growth:    { monthly: 119900 },
  portfolio: { monthly: 259900 },
  firm:      { monthly: 449900 },
  bespoke:   { monthly: null },
} as const

// ── Product line (ADDENDUM_18C) ─────────────────────────────────────────────────
// New first-class org axis (organisations.product_line): which product FAMILY the account runs —
// 'residential' (rentals: leases, tenants, applications) or 'hoa' (standalone body-corporate /
// managing-agent operations, no lease surface). Drives the tier ladder, feature map, and active
// surface set. Orthogonal to org type (framing) and role (per-user permissions). Every pre-18C org
// is 'residential' (DB DEFAULT backfill — NR-2: residential behaviour is byte-identical).
export const PRODUCT_LINES = ["residential", "hoa"] as const
export type ProductLine = (typeof PRODUCT_LINES)[number]

// HOA product-line tier ladder — its OWN ordered map. Ordinals are ONLY comparable within a line;
// never compare an HOA tier against a residential (TIER_ORDER) tier. Placeholder names + provisional
// unit bands, GTM-confirmable (Phase 3): studio ≈ boutique (2–4 schemes), practice ≈ one estate /
// ~10 schemes, firm ≈ multi-scheme, bespoke = enterprise/custom. (D-18C-02, answered 2026-07-06.)
export const HOA_TIER_ORDER = { hoa_studio: 0, hoa_practice: 1, hoa_firm: 2, hoa_bespoke: 3 } as const
export type HoaTier = keyof typeof HOA_TIER_ORDER

// Either-line tier. Only the FEW cross-line helpers (hasFeature/hasAccess) accept this; the tier's own
// literal identifies its line (residential and HOA literals are disjoint), so no product_line param is
// needed. Record<Tier> maps + TIER_ORDER indexing stay residential-only — do NOT widen `Tier`.
export type AnyTier = Tier | HoaTier

// Cap on TOTAL UNITS under management per HOA tier (D-18C-07 — cap basis = units, not schemes).
// null = unlimited (bespoke/custom contract). Numbers provisional — confirm at GTM. canCreateHoaEntity()
// reads this (Stage 2).
export const HOA_LIMITS = {
  hoa_studio:   { units: 300 },
  hoa_practice: { units: 1200 },
  hoa_firm:     { units: 3000 },
  hoa_bespoke:  { units: null },
} as const

// Founding agent pricing (first 10 clients — 24-month lock)
export const FOUNDING_AGENT_PRICE_CENTS = 29900 // R299/month
export const FOUNDING_AGENT_DURATION_MONTHS = 24

// Application screening fees. SSOT: brief/legal/SEARCHWORX_RATE_CARD.md §1.1 (amended 2026-05-18).
// R250 is the CURRENT price and R399 the superseded March-2026 single-bundle model — these constants
// were the last place still charging R399, three months after 005_operations.sql:1790 dropped the
// listings default to 25000 "down from R399". Bundle cost is R202.80 (Combined Consumer Credit Report
// R170 + VCCB R6.35 + fees), so R250 carries R47.20 (19%) margin. Do NOT price below R250 without
// re-reading rate-card §5: a R150 Lite tier was evaluated and rejected (D-RATE-08) because the R170
// Combined call is the floor for credible screening.
export const APPLICATION_FEE_CENTS = 25000 // R250 single — rate card §1.1
// R470 joint. NOT from the rate card: `grep -i joint` over SEARCHWORX_RATE_CARD.md returns ZERO hits —
// §1.1 prices ONE bundle and the card's only multi-subject pricing is D-RATE-06 (commercial: R250 company
// + R250 per director, which would imply R500 for two). R470 is a STÉAN DECISION of 2026-08-14, carrying
// the ~6% joint discount implied by the superseded R399/R749 pair. Recorded here because an earlier
// version of this comment mis-attributed it to the rate card. Amend the card, or keep the decision here —
// but do not cite §1.1 for it.
export const JOINT_APPLICATION_FEE_CENTS = 47000

/** What the applicant pays. Lives HERE, not in searchworxBundle: that module imports the Searchworx
 *  product modules (and through them supabase/server -> next/headers), which any consumer wanting only
 *  the fee should not have to load. */
export function getApplicationFee(isJoint: boolean): number {
  return isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS
}

/**
 * The WHOLE fee for an application, by the lines it screens. One transaction covers every line.
 *
 * JURISTIC (pty_ltd / cc / npc / trust): the entity's own line PLUS one line per surety party
 * (director, or trustee for a trust) — rate card D-RATE-06, "R250 company + N × per-director". The
 * entity and its sureties are paid for TOGETHER (Stéan ruling 2026-08-15): a juristic applicant has no
 * consumer credit profile of its own, so screening the company without a surety human screens nothing.
 * At least one surety party is required — enforced by validateJuristicParties, not here, so this stays
 * a pure arithmetic function.
 *
 * INDIVIDUAL: R250 single, R470 joint. NOT per-head — that is a recorded pricing decision, and
 * per-head pricing for 3+ residential applicants is blocked on the v2 Searchworx pipeline
 * (brief/build/OUTSTANDING.md § Per-head screening fee).
 */
export function screeningFeeCents(input: {
  readonly isJuristic: boolean
  /** Surety directors/trustees accompanying a juristic application. */
  readonly suretyCount: number
  /** Residential joint application (a couple). Ignored when isJuristic. */
  readonly hasCoApplicant: boolean
}): number {
  if (input.isJuristic) return APPLICATION_FEE_CENTS * (1 + Math.max(0, input.suretyCount))
  return getApplicationFee(input.hasCoApplicant)
}

/** The per-subject lines a fee covers, for writing one application_screening_payments row per line. */
export function screeningFeeLineCount(input: {
  readonly isJuristic: boolean
  readonly suretyCount: number
  readonly hasCoApplicant: boolean
}): number {
  if (input.isJuristic) return 1 + Math.max(0, input.suretyCount)
  return input.hasCoApplicant ? 2 : 1
}
export const INCOME_AFFORDABILITY_THRESHOLD = 0.3 // 30% of gross income — PRINCIPAL/co-applicant ceiling (rent ÷ combined gross; ≈ income ≥ 3.33× rent)
// A GUARANTOR_MIN_INCOME_MULTIPLE of 4 lived here, described as the guarantor/surety affordability floor —
// decoupled from and stricter than the principal threshold above (ADDENDUM_14M J4). It had no callers: the
// guarantee-strength signal it was meant to feed was never built, so the constant documented a design rather
// than tuning one. Deleted 2026-08-21. If that signal is built, the number and its reasoning are in git.
export const PROBATION_MONTHS = 3 // typical SA probation window — an inference for screening, NOT a legal status
// Applicants get the initial pre-screen + exactly ONE adjustment (re-check). Caps Sonnet cost + gaming;
// after this the agent reviews. Hard-enforced server-side (submit + /screen) AND surfaced clearly in the UI.
export const MAX_SCREENING_ITERATIONS = 2

/** Inference only: did employment start within the probation window? SA probation isn't fixed (it varies by
 *  contract/sector), so callers must surface this as agent-facing evidence — never a silent filter. */
export function startedWithinProbation(startDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!startDate) return false
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return false
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - PROBATION_MONTHS)
  return start > cutoff
}

// hoa_manager (ADDENDUM_18C D-18C-03): standalone HOA-management company — lease-less, reuses the
// agent role + AAL2 (NR-4, no new portal). Has a dedicated getOrgCapabilities branch that switches the
// rental surface off (hasLeases/hasTenants/hasApplications false), keeps HOA on, and relabels the trust
// surface to scheme funds (same D-TRUST-01 posture).
export const ORG_TYPES = ["agency", "landlord", "sole_prop", "hoa_manager"] as const
export type OrgType = (typeof ORG_TYPES)[number]

// The agent-role vocabulary lives in lib/auth: `OrgRole` (membership.ts) and `AgentRole` (roles.ts),
// which are what every gate and query actually read. A third copy here had no importers.

export const LEASE_TYPES = ["residential", "commercial"] as const
// No `LeaseType` alias here: the one that existed had no importers, and the name is used elsewhere
// in the tree for an unrelated notion. Callers that want the union write `(typeof LEASE_TYPES)[number]`.

export const SA_PROVINCES = [
  "Western Cape",
  "Eastern Cape",
  "Northern Cape",
  "North West",
  "Free State",
  "KwaZulu-Natal",
  "Gauteng",
  "Limpopo",
  "Mpumalanga",
] as const

export const DEFAULT_COUNTRY = "South Africa"

// Contacts can be abroad — South Africa first, then common countries. Province becomes free text off South Africa.
export const COUNTRIES = [
  "South Africa",
  "Namibia", "Botswana", "Zimbabwe", "Mozambique", "Eswatini", "Lesotho", "Zambia", "Malawi", "Mauritius",
  "United Kingdom", "Ireland", "Netherlands", "Belgium", "Germany", "France", "Spain", "Portugal", "Italy",
  "Switzerland", "Austria", "Denmark", "Sweden", "Norway", "Finland", "Greece", "Poland",
  "United States", "Canada", "Australia", "New Zealand",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "Israel",
  "India", "China", "Hong Kong", "Singapore", "Japan",
  "Nigeria", "Kenya", "Ghana", "Egypt", "Brazil", "Argentina", "Other",
] as const

export const UNIT_FEATURES = [
  "Pool",
  "Garden",
  "Solar",
  "Borehole",
  "Alarm",
  "Garage",
  "Carport",
  "Fibre",
  "DSTV",
  "Pet-friendly",
  "Wheelchair-accessible",
  "Air-conditioning",        // maps to `aircon` clause
] as const

// Currency formatting (South African Rand)
export function formatZARAbbrev(cents: number): string {
  const rands = cents / 100
  if (rands >= 1_000_000) return `R ${(rands / 1_000_000).toFixed(1)}m`
  if (rands >= 10_000) return `R ${Math.round(rands / 1000)}k`
  return formatZAR(cents)
}

export function formatZAR(cents: number, showCents = false): string {
  const rands = cents / 100
  const formatted = rands.toLocaleString("en-ZA", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
  return `R ${formatted}`
}
