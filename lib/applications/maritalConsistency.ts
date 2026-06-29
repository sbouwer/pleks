/**
 * lib/applications/maritalConsistency.ts — ADDENDUM_14M (spouse-linking amendment): marital-consistency flags.
 *
 * Pure. Over the full application party set (primary + co-applicants), surface where a declared spouse relationship
 * is internally inconsistent — DOCTRINE: allow, never block; flag for the agent + the deep scan to verify (14M §7).
 * Match key is the SA ID NUMBER (email is a weak secondary). Computed where the whole party set is known (the
 * submit-to-agent J1 gate), then persisted as screening signals so they ride into triage + the deep scan.
 */
import { type RulingFlag } from "./ruling"
import type { PartyAddressInput } from "@/lib/parties/partyValidation"

/** Normalise an address (a PartyAddressInput[] or a single one) to a comparable key for the divergence check (flag
 *  16). Uses the physical address; null when there's nothing to compare. Pure. */
export function addressKey(addresses: unknown): string | null {
  if (!addresses) return null
  const arr = (Array.isArray(addresses) ? addresses : [addresses]) as PartyAddressInput[]
  const a = arr.find((x) => x?.type === "physical") ?? arr[0]
  if (!a) return null
  const street = a.line1 || [a.streetNumber, a.streetName].filter(Boolean).join(" ")
  const parts = [street, a.suburb, a.city, a.postal].map((s) => (s ?? "").toString().toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean)
  return parts.length ? parts.join("|") : null
}

export interface MaritalParty {
  ref: string                 // "primary" | "co_{id}"
  name?: string | null
  idNumber?: string | null
  maritalStatus?: string | null
  matrimonialRegime?: string | null
  /** the persisted spouse_info — a co-applicant link (isCoApplicant + idNumber) or an external spouse (idNumber). */
  spouseInfo?: { isCoApplicant?: boolean; idNumber?: string | null; email?: string | null } | null
  /** a normalised current/home-address string — for the divergence check (caller normalises). */
  addressKey?: string | null
}

const nameOf = (p: MaritalParty) => p.name?.trim() || (p.ref === "primary" ? "the applicant" : "a co-applicant")

function flag15(a: MaritalParty, b: MaritalParty): RulingFlag {
  return { id: 15, key: "spousal_status_mismatch", axis: "integrity", severity: "minor", type: "signal",
    title: `${nameOf(a)} and ${nameOf(b)} are linked as spouses but declared a different marital status / matrimonial regime — verify the regime (it governs the combined-estate affordability).`, remediation: null }
}
function flag16(a: MaritalParty, b: MaritalParty): RulingFlag {
  return { id: 16, key: "spouse_address_divergence", axis: "confidence", severity: "minor", type: "signal",
    title: `${nameOf(a)} and ${nameOf(b)} are spouses applying together but gave different home addresses — verify cohabitation / the service address.`, remediation: null }
}
function flag17(a: MaritalParty, b: MaritalParty): RulingFlag {
  return { id: 17, key: "undisclosed_spouse_applicant", axis: "integrity", severity: "minor", type: "signal",
    title: `${nameOf(a)} declared a spouse who isn't applying, but that ID matches ${nameOf(b)} on this application — confirm whether ${nameOf(b)} is the spouse (matters for spousal consent and for not double-counting a person).`, remediation: null }
}

/**
 * Marital-consistency signals over the party set. Robust to missing data (a check is skipped when its inputs aren't
 * present — a co-applicant who hasn't declared yet can't mismatch). All flags are SIGNAL/minor — never blocking.
 */
export function maritalConsistencyFlags(primary: MaritalParty, coApplicants: ReadonlyArray<MaritalParty>): RulingFlag[] {
  const flags: RulingFlag[] = []
  const all: MaritalParty[] = [primary, ...coApplicants]
  const byId = new Map<string, MaritalParty>()
  for (const p of all) if (p.idNumber) byId.set(p.idNumber, p)

  // 15 / 16 — the primary's spouse is a NAMED co-applicant (linked by ID): compare regime + address.
  const si = primary.spouseInfo
  if (primary.maritalStatus === "married" && si?.isCoApplicant && si.idNumber) {
    const spouse = byId.get(si.idNumber)
    if (spouse && spouse.ref !== primary.ref) {
      // The spouse has declared, and it doesn't agree (not married, or a different regime).
      const spouseDeclared = spouse.maritalStatus != null
      const regimeDisagrees = spouse.maritalStatus !== "married" || (spouse.matrimonialRegime ?? "") !== (primary.matrimonialRegime ?? "")
      if (spouseDeclared && regimeDisagrees) flags.push(flag15(primary, spouse))
      if (primary.addressKey && spouse.addressKey && primary.addressKey !== spouse.addressKey) flags.push(flag16(primary, spouse))
    }
  }

  // 17 — ANY party declares an EXTERNAL spouse whose ID matches another party on the application.
  for (const p of all) {
    const ext = p.spouseInfo
    if (p.maritalStatus === "married" && ext && !ext.isCoApplicant && ext.idNumber) {
      const match = byId.get(ext.idNumber)
      if (match && match.ref !== p.ref) flags.push(flag17(p, match))
    }
  }
  return flags
}
