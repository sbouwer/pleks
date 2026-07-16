/**
 * lib/import/assemble/normalise.ts — make two REFERENCE values comparable before matching (ADDENDUM_21C D-5/D-6)
 *
 * Notes:  "REFERENCE values must be normalised identically before matching (whitespace, leading zeros, prefixes)
 *         or matching rows silently fail to join and become orphans" — the multi-file version of the phone/email
 *         normalisation lesson. And the prefix IS the entity-type discriminator (D-5), so it must be extractable
 *         and comparisons namespace-disambiguated: a bare `LEA000001` vs `TEN000001` compare crosses namespaces.
 */
import { normalizePhone } from "@/lib/validation/contact"

/** Split a REFERENCE into its letter prefix (the namespace) and its digit body. `"LEA000001"` → `["LEA","000001"]`. */
function splitRef(raw: string): { prefix: string; digits: string; rest: string } {
  const compact = raw.trim().toUpperCase().replaceAll(/\s+/g, "")
  const m = /^([A-Z]+)(\d+)$/.exec(compact)
  if (m) return { prefix: m[1]!, digits: m[2]!, rest: "" }
  return { prefix: "", digits: "", rest: compact }
}

/**
 * The namespace prefix of a REFERENCE — `"LEA000001"` → `"LEA"`, `"TEN000001"` → `"TEN"`. Empty when the value is
 * not a prefix+number code. Two references are only ever comparable within the SAME prefix (D-5).
 */
export function refPrefix(raw: string): string {
  return splitRef(raw).prefix
}

/**
 * Canonical form for MATCHING — uppercase, whitespace-stripped, and leading zeros removed from the numeric body so
 * `LEA000001` / `LEA00001` / `LEA1` all compare equal (D-6). Keep the ORIGINAL for display; match on this.
 */
export function normaliseRef(raw: string): string {
  const { prefix, digits, rest } = splitRef(raw)
  if (!prefix) return rest
  const trimmed = digits.replace(/^0+/, "") || "0"
  return `${prefix}${trimmed}`
}

/**
 * Name normaliser — MIRROR of `lib/import/identity.ts`'s module-private `normaliseName` (lowercase, keep only
 * a–z). Duplicated as ONE line rather than exported, because ADDENDUM_21C D-1 keeps identity.ts untouched; the
 * phone half reuses the `normalizePhone` SSOT (below), which is the half a hand-roll would actually get wrong.
 */
export function normaliseName(v: string | null | undefined): string | null {
  return (v ?? "").toLowerCase().replaceAll(/[^a-z]/g, "") || null
}

/** Re-export the phone SSOT so the assembler never hand-rolls one (`pleks/no-rerolled-phone-normalise`). */
export { normalizePhone }

/**
 * Parse a `lease_parties` display string into name + phone. MRI's `LeaseExpiry.TENANTS` is `"Family Farao
 * (0719780357)"` — a household name with the contact number in parentheses. Returns the raw name and the
 * PARENTHESISED phone (the reliable key; the name is a household label, not a contact name).
 */
export function parsePartyString(raw: string): { name: string; phone: string | null } {
  const s = raw.trim()
  // Index-based (no regex backtracking): the phone is the LAST parenthesised group; the name is what precedes it.
  const open = s.lastIndexOf("(")
  const close = s.lastIndexOf(")")
  if (open >= 0 && close > open) {
    const name = s.slice(0, open).trim()
    return { name: name || s, phone: normalizePhone(s.slice(open + 1, close).trim()) }
  }
  return { name: s, phone: null }
}
