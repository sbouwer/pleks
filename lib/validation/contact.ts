/**
 * lib/validation/contact.ts — SYSTEM-WIDE validators for contact details: email, phone (SA / foreign) and the
 * CIPC registration number.
 *
 * The single source of truth so every surface (apply wizard, party forms, CSV imports, the public contact form)
 * validates identically — import these, never re-roll a regex. Pure + dependency-free (so it's safe to use on the
 * client and the server, and easy to unit-test). Format-only: this checks shape, not deliverability or a live CIPC
 * lookup. Phone parsing/validation/formatting is backed by libphonenumber-js (every country's numbering plan),
 * with a default region of South Africa so a bare local number (082…) parses.
 */
// "/max" metadata = the full national-number patterns, so isValid() actually validates the numbering plan (the
// default "min" metadata only length-checks, which would wrongly pass a 9-digit SA number).
import { parsePhoneNumberFromString } from "libphonenumber-js/max"

// ── Email ──────────────────────────────────────────────────────────────────────
// A local part, "@", and a domain with at least one dot + a 2+ char TLD; no spaces. RFC-pragmatic (not full 5322)
// with sane length caps — the same shape the contact form / importer already used, now shared.
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/

export function isValidEmail(raw: string | null | undefined): boolean {
  return EMAIL_RX.test((raw ?? "").trim())
}

/** Error string for an email field, or null when valid. `required` controls whether empty is an error. */
export function emailError(raw: string | null | undefined, required = true): string | null {
  const v = (raw ?? "").trim()
  if (!v) return required ? "Required" : null
  return isValidEmail(v) ? null : "Enter a valid email address (e.g. name@example.co.za)."
}

// ── Phone ──────────────────────────────────────────────────────────────────────
export type PhoneKind = "sa" | "foreign" | "invalid"
export interface PhoneCheck { valid: boolean; kind: PhoneKind; reason?: string; e164?: string; country?: string }

/**
 * Classify + validate a phone number. South African numbers are checked STRICTLY against our own rule (exactly 10
 * significant digits — local 0XXXXXXXXX, or +27 / 0027 then 9 digits), which is tighter than libphonenumber's
 * length leniency. Anything dialling out with a different country code is FOREIGN and validated against that
 * country's real numbering plan via libphonenumber-js. A bare number with no 0 / + prefix is rejected.
 */
export function checkPhone(raw: string | null | undefined): PhoneCheck {
  const v = (raw ?? "").trim()
  if (!v) return { valid: false, kind: "invalid", reason: "Required" }
  const compact = v.replace(/[\s()\-.]/g, "")
  if (/[^\d+]/.test(compact) || (compact.includes("+") && !compact.startsWith("+"))) {
    return { valid: false, kind: "invalid", reason: "Use digits only, with a leading + for international." }
  }
  // SA forms: a leading 0 (but not 00), or the +27 / 0027 international prefixes.
  if (/^0(?!0)/.test(compact) || compact.startsWith("+27") || compact.startsWith("0027")) {
    const okSA = /^0\d{9}$/.test(compact) || /^\+27\d{9}$/.test(compact) || /^0027\d{9}$/.test(compact)
    if (!okSA) return { valid: false, kind: "sa", reason: "A South African number is 10 digits (e.g. 082 123 4567)." }
    return { valid: true, kind: "sa", e164: `+27${compact.replace(/\D/g, "").slice(-9)}`, country: "ZA" }
  }
  // Foreign: the 00 international prefix becomes +, then validate against the country's plan.
  const intl = compact.startsWith("00") ? `+${compact.slice(2)}` : compact
  const parsed = intl.startsWith("+") ? parsePhoneNumberFromString(intl) : undefined
  if (parsed?.isValid()) return { valid: true, kind: "foreign", e164: parsed.number, country: parsed.country }
  return { valid: false, kind: "invalid", reason: "Enter a valid phone number — 10 digits for SA, or +<country code> for international." }
}

/** Error string for a phone field, or null when valid. */
export function phoneError(raw: string | null | undefined, required = true): string | null {
  const v = (raw ?? "").trim()
  if (!v) return required ? "Required" : null
  return checkPhone(v).reason ?? null
}

/** Normalise to a canonical E.164 string for STORAGE (e.g. +27821234567, +12133734253) — or null if invalid. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const c = checkPhone(raw)
  return c.valid ? (c.e164 ?? null) : null
}

/**
 * Format for DISPLAY — uniform across the system, grouped per the number's own country: "+27 82 123 4567",
 * "+1 213 373 4253", "+44 20 7946 0958". An unparseable value is returned trimmed (never throws), so it's safe
 * to wrap any stored/typed string.
 */
export function formatPhone(raw: string | null | undefined): string {
  const c = checkPhone(raw)
  if (!c.valid || !c.e164) return (raw ?? "").trim()
  const parsed = parsePhoneNumberFromString(c.e164)
  return parsed ? parsed.formatInternational() : c.e164
}

/** The full international number as digits only, no "+" — what WhatsApp / wa.me links expect (e.g. 27821234567). */
export function phoneToWhatsApp(raw: string | null | undefined): string | null {
  const e164 = normalizePhone(raw)
  return e164 ? e164.replace(/\D/g, "") : null
}

// ── CIPC registration number ─────────────────────────────────────────────────────
// The standard CIPC company number: YYYY/NNNNNN/NN — the first 4 are the registration year and the last 2 are the
// ENTITY-TYPE code. Trusts use a Master's reference (free-form), so callers only enforce this for CIPC types.
const CIPC_RX = /^\d{4}\/\d{6}\/\d{2}$/

/** The last two digits of a CIPC number classify the entity type. (Common codes — not exhaustive.) */
export const CIPC_ENTITY_CODES: Record<string, string> = {
  "06": "Public company (Ltd)",
  "07": "Private company (Pty Ltd)",
  "08": "Non-profit company (NPC)",
  "10": "External company",
  "23": "Close corporation (CC)",
  "30": "State-owned company (SOC)",
}

/** Our app's company-type values → the CIPC entity code their registration number must end in. */
const CIPC_CODE_FOR_TYPE: Record<string, string> = { pty_ltd: "07", cc: "23", npc: "08" }

/** Insert the standard separators when the user typed 12 bare digits (idempotent); otherwise return as-is, trimmed. */
export function formatCipcReg(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (digits.length === 12) return `${digits.slice(0, 4)}/${digits.slice(4, 10)}/${digits.slice(10)}`
  return (raw ?? "").trim()
}

/** Error string for a CIPC reg field, or null when valid. Pass companyType to also enforce the entity-type code. */
export function cipcRegError(raw: string | null | undefined, required = true, companyType?: string | null): string | null {
  const v = formatCipcReg(raw)
  if (!v.replace(/\D/g, "")) return required ? "Required" : null
  if (!CIPC_RX.test(v)) return "Use the CIPC format YYYY/NNNNNN/NN (e.g. 2019/123456/07)."
  const year = Number(v.slice(0, 4))
  if (year < 1900 || year > new Date().getFullYear() + 1) return "The first four digits should be the registration year (e.g. 2019)."
  const code = v.slice(-2)
  const expected = companyType ? CIPC_CODE_FOR_TYPE[companyType] : undefined
  if (expected && code !== expected) return `A ${CIPC_ENTITY_CODES[expected]} registration number ends in /${expected}, not /${code}.`
  if (!expected && !(code in CIPC_ENTITY_CODES)) return `/${code} isn't a recognised CIPC entity-type code.`
  return null
}

export function isValidCipcReg(raw: string | null | undefined, companyType?: string | null): boolean {
  return cipcRegError(raw, true, companyType) === null
}
