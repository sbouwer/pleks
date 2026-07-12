/**
 * lib/import/classify.ts — classify statutory-adjacent lease fields at the import boundary: FLAG, never guess
 *
 * Notes:  The same doctrine as the money parser (F-3): an unrecognised value is a ROW-LEVEL REVIEW ITEM for
 *         the agent, never a silent default. The old code guessed both of these fields and the guesses were
 *         load-bearing:
 *           - `lease_type`: `raw.includes("comm") ? "commercial" : "residential"` — so "Retail", "Office" and
 *             "Industrial" all imported as RESIDENTIAL, and Rule 8 then permits the residential
 *             Demand-to-Vacate suite against a commercial lease. A wrong default here is a statutory error,
 *             not a cosmetic one.
 *           - `escalation_type`: anything unrecognised fell through to "fixed" — so "market related" or a
 *             typo silently became a fixed escalation, which is a money term.
 *         Both now recognise an explicit vocabulary (en + af) on BOTH sides and return `{ok:false}` for
 *         anything else. A value that matches BOTH classes ("residential/commercial") is CONTRADICTORY and
 *         also flags — first-match-wins would be a guess with extra steps.
 *         The caller omits the column entirely on a flag, so the DB default stands and the agent sees a
 *         warning naming the row, the field and the raw value.
 */

/** A classification that either resolved to a known enum value, or did not — in which case the caller must
 *  surface `raw` to the agent as a review item and REFUSE the row. Note "write nothing to the column" is NOT
 *  an option for these fields: `leases.lease_type` is `NOT NULL DEFAULT 'residential'` and
 *  `leases.escalation_type` is `NOT NULL DEFAULT 'fixed'`, so omitting the column re-instates the exact guess
 *  the classification exists to prevent. Unrecognised ⇒ the row does not import. */
export type Classification<T> = { ok: true; value: T } | { ok: false; raw: string }

export type LeaseType = "residential" | "commercial"
export type EscalationType = "fixed" | "cpi" | "prime_plus"

/** The `properties.province` CHECK constraint (003_properties.sql) — an import that writes anything else is
 *  rejected by Postgres, so the importer must resolve to exactly one of these or refuse the property. */
export const SA_PROVINCES = [
  "Western Cape", "Eastern Cape", "Northern Cape", "North West", "Free State",
  "KwaZulu-Natal", "Gauteng", "Limpopo", "Mpumalanga",
] as const
export type SaProvince = (typeof SA_PROVINCES)[number]

/** Abbreviations and spellings a real agency export actually carries, → the CHECK-constraint spelling. */
const PROVINCE_ALIASES: Record<string, SaProvince> = {
  wc: "Western Cape", "w cape": "Western Cape", "western cape": "Western Cape", wes_kaap: "Western Cape", "wes-kaap": "Western Cape",
  ec: "Eastern Cape", "e cape": "Eastern Cape", "eastern cape": "Eastern Cape", "oos-kaap": "Eastern Cape",
  nc: "Northern Cape", "n cape": "Northern Cape", "northern cape": "Northern Cape", "noord-kaap": "Northern Cape",
  nw: "North West", "north west": "North West", "north-west": "North West", noordwes: "North West",
  fs: "Free State", "free state": "Free State", vrystaat: "Free State",
  kzn: "KwaZulu-Natal", "kwazulu natal": "KwaZulu-Natal", "kwazulu-natal": "KwaZulu-Natal", kwazulunatal: "KwaZulu-Natal", natal: "KwaZulu-Natal",
  gp: "Gauteng", gt: "Gauteng", gauteng: "Gauteng",
  lp: "Limpopo", limpopo: "Limpopo",
  mp: "Mpumalanga", mpumalanga: "Mpumalanga",
}

/**
 * Resolve a raw province cell to the exact spelling `properties.province`'s CHECK constraint permits.
 * Unrecognised → flagged, never guessed: writing an unlisted province is a hard Postgres rejection that
 * would otherwise surface as an opaque whole-property failure.
 */
export function classifyProvince(raw: string): Classification<SaProvince> {
  const s = raw.toLowerCase().trim().replaceAll(/\s+/g, " ")
  if (!s) return { ok: false, raw }
  const hit = PROVINCE_ALIASES[s]
  return hit ? { ok: true, value: hit } : { ok: false, raw }
}

// WORD-BOUNDARY matching, not substring. A bare `includes` is what makes this class of check quietly wrong:
// "warehouse" CONTAINS "house", so a substring check reads a warehouse as both commercial and residential.
// \b also keeps "percentage"-style words from matching a short token. Both vocabularies carry en + af.
const COMMERCIAL_RE = /\b(commercial|comm|retail|office|industrial|warehouse|shop|business|kantoor|winkel|besigheid)\b/
const RESIDENTIAL_RE = /\b(residential|resi|home|dwelling|flat|apartment|house|sectional\s+title|woonstel|woon|huis)\b/

/**
 * Classify a raw `lease_type` cell. Recognises commercial AND residential vocabularies explicitly; an
 * unrecognised value — or one that reads as BOTH — is flagged rather than defaulted. Never returns
 * "residential" as a fallback: that fallback is precisely the F-7 defect.
 */
export function classifyLeaseType(raw: string): Classification<LeaseType> {
  const s = raw.toLowerCase().trim()
  if (!s) return { ok: false, raw }

  const commercial = COMMERCIAL_RE.test(s)
  const residential = RESIDENTIAL_RE.test(s)

  if (commercial && !residential) return { ok: true, value: "commercial" }
  if (residential && !commercial) return { ok: true, value: "residential" }
  return { ok: false, raw } // unrecognised, or contradictory (both) → the agent decides
}

/**
 * Classify a raw `escalation_type` cell into the DB enum. "fixed" is a REAL value that must be stated, not
 * the bucket everything unrecognised falls into (the F-7 defect). A cell naming two bases is contradictory
 * and flags.
 */
export function classifyEscalationType(raw: string): Classification<EscalationType> {
  const s = raw.toLowerCase().trim()
  if (!s) return { ok: false, raw }

  const hits: EscalationType[] = []
  if (/\b(cpi|consumer\s+price|inflation)\b/.test(s)) hits.push("cpi")
  if (/\bprime\b/.test(s)) hits.push("prime_plus")
  if (/\b(fixed|vaste?)\b/.test(s)) hits.push("fixed")

  const only = hits.length === 1 ? hits[0] : undefined
  return only ? { ok: true, value: only } : { ok: false, raw }
}
