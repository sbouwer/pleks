/**
 * lib/validation/contact.ts — SYSTEM-WIDE validators for contact details: email, phone (SA / foreign) and the
 * CIPC registration number.
 *
 * The single source of truth so every surface (apply wizard, party forms, CSV imports, the public contact form)
 * validates identically — import these, never re-roll a regex. Pure + dependency-free (so it's safe to use on the
 * client and the server, and easy to unit-test). Format-only: this checks shape, not deliverability or a live CIPC
 * lookup. For SENDING, normalise SA numbers with normalizePhoneZA (lib/consent/verification.ts).
 */

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
export interface PhoneCheck { valid: boolean; kind: PhoneKind; reason?: string }

/**
 * Classify + validate a phone number. South African numbers are checked strictly; anything that dials out with a
 * different country code is treated as FOREIGN and only sanity-checked for length (different national rules):
 *  - SA local     0XXXXXXXXX     → exactly 10 digits
 *  - SA E.164     +27XXXXXXXXX   → +27 then 9 digits
 *  - SA 00-prefix 0027XXXXXXXXX  → 0027 then 9 digits
 *  - FOREIGN      + / 00 prefix that ISN'T +27 / 0027 → 8–15 digits (E.164 max)
 * Spaces, dashes, dots and brackets are tolerated (stripped before checking).
 */
export function checkPhone(raw: string | null | undefined): PhoneCheck {
  const v = (raw ?? "").replace(/[\s()\-.]/g, "")
  if (!v) return { valid: false, kind: "invalid", reason: "Required" }
  // Only digits, with an optional single leading "+".
  if (/[^\d+]/.test(v) || (v.includes("+") && !v.startsWith("+"))) {
    return { valid: false, kind: "invalid", reason: "Use digits only, with an optional leading + for international." }
  }
  if (v.startsWith("+27")) return verdict(/^\+27\d{9}$/.test(v), "sa", "A South African number is +27 then 9 digits.")
  if (v.startsWith("0027")) return verdict(/^0027\d{9}$/.test(v), "sa", "A South African number is 0027 then 9 digits.")
  if (v.startsWith("+") || v.startsWith("00")) {
    const digits = v.replace(/\D/g, "")
    return verdict(digits.length >= 8 && digits.length <= 15, "foreign", "Enter the full international number, including the country code.")
  }
  if (v.startsWith("0")) return verdict(/^0\d{9}$/.test(v), "sa", "A South African number is 10 digits (e.g. 082 123 4567).")
  return { valid: false, kind: "invalid", reason: "Start with 0 for a South African number, or + for an international one." }
}

function verdict(ok: boolean, kind: PhoneKind, reason: string): PhoneCheck {
  return ok ? { valid: true, kind } : { valid: false, kind, reason }
}

/** Error string for a phone field, or null when valid. */
export function phoneError(raw: string | null | undefined, required = true): string | null {
  const v = (raw ?? "").trim()
  if (!v) return required ? "Required" : null
  return checkPhone(v).reason ?? null
}

/**
 * Normalise to a canonical E.164 string for STORAGE (so every saved number has one shape) — or null if invalid.
 *  - SA      → +27XXXXXXXXX  (the last 9 digits are the subscriber number, regardless of 0 / +27 / 0027 entry)
 *  - Foreign → +<countrycode><number>  (the 00 international prefix becomes +)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const c = checkPhone(raw)
  if (!c.valid) return null
  const v = (raw ?? "").replace(/[\s()\-.]/g, "")
  if (c.kind === "sa") return `+27${v.replace(/\D/g, "").slice(-9)}`
  const digits = v.replace(/\D/g, "")
  return v.startsWith("00") ? `+${digits.slice(2)}` : `+${digits}`
}

/**
 * Format for DISPLAY — uniform across the system. SA numbers group as "+27 82 123 4567"; foreign numbers show in
 * plain E.164 ("+15551234567") since national grouping varies by country (add libphonenumber-js later if needed).
 * An unparseable value is returned trimmed (never throws), so it's safe to wrap any stored/typed string.
 */
export function formatPhone(raw: string | null | undefined): string {
  const e164 = normalizePhone(raw)
  if (!e164) return (raw ?? "").trim()
  if (e164.startsWith("+27") && e164.length === 12) {
    const n = e164.slice(3)
    return `+27 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`
  }
  return e164
}

// ── CIPC registration number ─────────────────────────────────────────────────────
// The standard CIPC company number: YYYY/NNNNNN/NN (Pty / CC / NPC). Trusts use a Master's reference (free-form),
// so callers should only enforce this for CIPC-registered juristic types.
const CIPC_RX = /^\d{4}\/\d{6}\/\d{2}$/

export function isValidCipcReg(raw: string | null | undefined): boolean {
  return CIPC_RX.test((raw ?? "").trim())
}

/** Error string for a CIPC reg field, or null when valid. */
export function cipcRegError(raw: string | null | undefined, required = true): string | null {
  const v = (raw ?? "").trim()
  if (!v) return required ? "Required" : null
  return isValidCipcReg(v) ? null : "Use the CIPC format YYYY/NNNNNN/NN (e.g. 2019/123456/07)."
}
