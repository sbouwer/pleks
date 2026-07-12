/**
 * lib/import/classify.ts — classify statutory-adjacent import cells: FLAG, never guess
 *
 * Notes:  Same doctrine as the money parser (F-3): an unrecognised value is a decision for the AGENT, never a
 *         silent default. The old code guessed all of these, and every guess was load-bearing:
 *           - `lease_type`: `includes("comm") ? commercial : residential` — "Retail"/"Office" imported as
 *             RESIDENTIAL, and Rule 8 then permits the residential Demand-to-Vacate suite against a commercial
 *             lease. A wrong default here is a statutory error.
 *           - `escalation_type`: anything unrecognised fell through to "fixed" — a money term.
 *           - booleans (`cpa_applies`, `is_fixed_term`): `s === "yes" || s === "true" || …` → everything else
 *             FALSE. Both columns are NOT NULL DEFAULT **true**, so a book exporting Y/N (the commonest SA
 *             convention) had CPA protection stripped from every lease and every fixed term made open-ended.
 *
 *         Matching is by WHOLE WORD TOKEN, not substring and not \b-regex. Substring matching reads
 *         "warehouse" as residential (it contains "house"); \b-regex then over-corrects and refuses
 *         "Townhouse"/"Woonhuis" (no boundary inside a compound). Tokenising on non-letters and comparing
 *         whole words gets both right, and makes a value naming BOTH classes ("Residential/Commercial")
 *         detectably contradictory instead of first-match-wins.
 *
 *         NOTE "Sectional Title" is deliberately NOT residential: it is a form of TENURE, not a use — a
 *         sectional-title unit in a commercial office scheme is ordinary. It flags.
 */

/** Resolved to a known value, or not — in which case the caller must surface `raw` and REFUSE the row.
 *  "Write nothing to the column" is NOT an escape for these fields: `leases.lease_type` is
 *  `NOT NULL DEFAULT 'residential'`, `escalation_type` `NOT NULL DEFAULT 'fixed'`, and `cpa_applies` /
 *  `is_fixed_term` `NOT NULL DEFAULT true` — omitting a column hands the row straight back to the guess. */
export type Classification<T> = { ok: true; value: T } | { ok: false; raw: string }

export type LeaseType = "residential" | "commercial"
export type EscalationType = "fixed" | "cpi" | "prime_plus"

/** Split a cell into lowercase word tokens ("Semi-Commercial" → ["semi","commercial"]). */
function words(raw: string): Set<string> {
  return new Set(raw.toLowerCase().split(/[^a-z]+/).filter(Boolean))
}

function hasAny(w: Set<string>, vocab: readonly string[]): boolean {
  return vocab.some((t) => w.has(t))
}

// Whole-word vocabularies (en + af). Compounds and inflections are listed in FULL — token matching cannot see
// inside a word, so "shopping" does not match "shop" and each real-world form has to be present or the lease
// is refused. A missing word is a refused lease, not a wrong one (fail-closed), but a book of 60 "Shopping
// Centre" leases refusing wholesale is its own kind of failure.
const COMMERCIAL_WORDS = [
  "commercial", "comm", "retail", "office", "offices", "industrial", "warehouse", "warehousing",
  "shop", "shops", "shopping", "workshop", "mall", "storage", "showroom", "premises", "business",
  "factory", "kantoor", "kantoorgebou", "winkel", "besigheid", "pakhuis",
] as const

const RESIDENTIAL_WORDS = [
  "residential", "resi", "residence", "home", "dwelling", "flat", "apartment", "house", "townhouse",
  "townhouses", "duplex", "simplex", "cottage", "bachelor", "maisonette", "cluster",
  "woonstel", "woonhuis", "huis", "woning", // af
] as const

/**
 * Classify a raw `lease_type` cell. Both vocabularies are explicit — "residential" is a VALUE, never the
 * bucket everything unknown falls into. Unrecognised, empty, or contradictory ⇒ flagged.
 */
export function classifyLeaseType(raw: string): Classification<LeaseType> {
  const w = words(raw)
  if (w.size === 0) return { ok: false, raw }

  const commercial = hasAny(w, COMMERCIAL_WORDS)
  const residential = hasAny(w, RESIDENTIAL_WORDS)

  if (commercial && !residential) return { ok: true, value: "commercial" }
  if (residential && !commercial) return { ok: true, value: "residential" }
  return { ok: false, raw } // unknown (e.g. "Sectional Title" — a tenure) or contradictory → the agent decides
}

/**
 * Classify a raw `escalation_type` cell. "fixed" must be STATED, not inferred from silence, and a cell naming
 * two bases ("CPI or Prime") is contradictory rather than first-match.
 */
export function classifyEscalationType(raw: string): Classification<EscalationType> {
  const w = words(raw)
  if (w.size === 0) return { ok: false, raw }

  const hits: EscalationType[] = []
  if (w.has("cpi") || w.has("inflation") || (w.has("consumer") && w.has("price"))) hits.push("cpi")
  if (w.has("prime")) hits.push("prime_plus")
  if (w.has("fixed") || w.has("vaste") || w.has("vast")) hits.push("fixed")

  const only = hits.length === 1 ? hits[0] : undefined
  return only ? { ok: true, value: only } : { ok: false, raw }
}

const TRUE_WORDS = ["true", "yes", "y", "1", "ja", "j"] as const
const FALSE_WORDS = ["false", "no", "n", "0", "nee"] as const

/**
 * Classify a boolean cell. Critically, an unrecognised value is NOT false: `cpa_applies` and `is_fixed_term`
 * are `NOT NULL DEFAULT true`, so the old fail-to-false was the opposite of the schema's own default — a book
 * using Y/N had the CPA stripped from every lease. Unrecognised ⇒ flag, and the caller refuses the row.
 */
export function classifyBoolean(raw: string): Classification<boolean> {
  const s = raw.toLowerCase().trim()
  if (!s) return { ok: false, raw }
  if ((TRUE_WORDS as readonly string[]).includes(s)) return { ok: true, value: true }
  if ((FALSE_WORDS as readonly string[]).includes(s)) return { ok: true, value: false }
  return { ok: false, raw }
}

// ── Province (properties.province CHECK constraint, 003_properties.sql) ────────────────────────────────

/** The exact spellings the CHECK permits — anything else is a hard Postgres rejection. */
export const SA_PROVINCES = [
  "Western Cape", "Eastern Cape", "Northern Cape", "North West", "Free State",
  "KwaZulu-Natal", "Gauteng", "Limpopo", "Mpumalanga",
] as const
export type SaProvince = (typeof SA_PROVINCES)[number]

/** Letters-only keys, matched as a SUBSTRING so "Gauteng Province", "Western Cape." and "Kwa-Zulu Natal" all
 *  resolve. Longest first, so "northerncape" can never be shadowed by a shorter key. */
const PROVINCE_KEYS: Array<[key: string, province: SaProvince]> = [
  ["kwazulunatal", "KwaZulu-Natal"], ["westerncape", "Western Cape"], ["easterncape", "Eastern Cape"],
  ["northerncape", "Northern Cape"], ["freestate", "Free State"], ["northwest", "North West"],
  ["mpumalanga", "Mpumalanga"], ["gauteng", "Gauteng"], ["limpopo", "Limpopo"],
  // af
  ["weskaap", "Western Cape"], ["ooskaap", "Eastern Cape"], ["noordkaap", "Northern Cape"],
  ["noordwes", "North West"], ["vrystaat", "Free State"],
  ["natal", "KwaZulu-Natal"],   // after kwazulunatal, so the full name wins
]

/** Abbreviations. Matched EXACTLY (never as a substring — "wc" would otherwise hit inside another word). */
const PROVINCE_ABBREVIATIONS: Record<string, SaProvince> = {
  wc: "Western Cape", ec: "Eastern Cape", nc: "Northern Cape", nw: "North West",
  fs: "Free State", kzn: "KwaZulu-Natal", gp: "Gauteng", gt: "Gauteng",
  lp: "Limpopo", mp: "Mpumalanga",
}

/**
 * Resolve a raw province cell to the exact spelling the CHECK permits. Tolerant by design: an unmatched
 * province REFUSES the whole property — and with it every unit and lease under it — so a formatting quirk
 * like "Gauteng Province" must not cost an agency 40 leases. Genuinely unknown values still flag.
 */
export function classifyProvince(raw: string): Classification<SaProvince> {
  const compact = raw.toLowerCase().replaceAll(/[^a-z]/g, "")
  if (!compact) return { ok: false, raw }

  const abbrev = PROVINCE_ABBREVIATIONS[compact]
  if (abbrev) return { ok: true, value: abbrev }

  for (const [key, province] of PROVINCE_KEYS) {
    if (compact.includes(key)) return { ok: true, value: province }
  }
  return { ok: false, raw }
}
