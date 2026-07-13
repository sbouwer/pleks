/**
 * lib/import/plausibility.ts — bounds: "it parses" is a much weaker claim than "it could be true"
 *
 * Notes:  The poison harness (test/db/import-poison.dbtest.ts) fed the importer one deliberately wrong value at
 *         a time. Six were accepted in SILENCE — a negative rent, a lease that ends before it starts, a negative
 *         notice period, an email that is not an email, an SA ID that fails its own checksum, a rent that falls.
 *         Every one of them PARSED. Type-validity was never the question.
 *
 *         And an escalation of 9999% was only caught because it OVERFLOWS numeric(5,2) — i.e. by accident of
 *         the column width. 500% would have sailed straight through: type-valid, and absurd. A bound that
 *         exists only as a side-effect of a storage type is not a bound.
 *
 *         So: DOMAIN limits, stated once, out loud.
 *
 *         REFUSE vs FLAG — the line is INCOHERENT vs IMPLAUSIBLE:
 *           REFUSE  the value cannot be true of any lease. A negative rent is not a lease. A lease that ends
 *                   before it begins is not a lease. Importing it would corrupt every computation downstream,
 *                   and no human meant it.
 *           FLAG    the value COULD be true but almost certainly is not — a 45% escalation, a deposit twelve
 *                   times the rent. Refusing it would block a legitimate edge case; saying nothing would let a
 *                   fat-fingered zero become a tenant's problem for a decade. So: import it, and say so.
 *
 *         The bounds are deliberately WIDE. They are not a policy on what a lease may say; they are a net for
 *         the fat-fingered zero and the mis-mapped column.
 */

/** Rent, in cents per month. Above the ceiling is almost certainly a units error (rands read as cents). */
export const RENT_CENTS_MAX = 500_000_00        // R500 000 pm — a large commercial letting, comfortably.

/** A deposit is normally 1–2 months' rent; 3 is common commercially. Beyond this multiple, someone slipped. */
export const DEPOSIT_RENT_MULTIPLE_MAX = 12

/** Annual escalation. SA leases run 5–10%; 20% is aggressive; beyond 50% is a typo or a units error. */
export const ESCALATION_PERCENT_MAX = 50

/** Arrears interest margin over prime. The NCA caps what may be charged; 30 is far past any real margin. */
export const ARREARS_MARGIN_PERCENT_MAX = 30

/** Notice period, in days. A year is already extraordinary. */
export const NOTICE_PERIOD_DAYS_MAX = 365

/** Deposit-return deadline, in days. RHA works in 7/14/21; 90 is already generous. */
export const DEPOSIT_RETURN_DAYS_MAX = 90

/** How far back a lease may plausibly have started. Beyond this it is a date-format error, not history. */
export const LEASE_START_MAX_YEARS_AGO = 50

export type Severity = "error" | "warning"

export interface PlausibilityIssue {
  field: string
  severity: Severity
  message: string
}

/** INCOHERENT — no lease can be like this. Refuse. */
function incoherent(field: string, message: string): PlausibilityIssue {
  return { field, severity: "error", message }
}

/** IMPLAUSIBLE — it could be true, but almost certainly is not. Import it, and say so. */
function implausible(field: string, message: string): PlausibilityIssue {
  return { field, severity: "warning", message }
}

/**
 * Check a lease's numbers and dates against what a real lease can say. Returns every issue found; the caller
 * REFUSES the row if any is an "error", and flags the rest.
 */
export function checkLeasePlausibility(lease: {
  rentCents: number
  depositCents: number | null
  escalationPercent: number | null
  arrearsMarginPercent: number | null
  noticePeriodDays: number | null
  depositReturnDays: number | null
  startDate: string
  endDate: string | null
  todayISO: string
}): PlausibilityIssue[] {
  return [
    ...checkMoney(lease),
    ...checkStatutoryClocks(lease),
    ...checkDates(lease),
  ]
}

/** Rent, deposit, escalation, arrears margin — the numbers that move money. */
function checkMoney(lease: {
  rentCents: number; depositCents: number | null
  escalationPercent: number | null; arrearsMarginPercent: number | null
}): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = []
  const { rentCents, depositCents, escalationPercent, arrearsMarginPercent } = lease

  // ── Rent. The number every other number is derived from.
  if (rentCents < 0) {
    issues.push(incoherent("rent_amount_cents",
      `Rent is NEGATIVE (${(rentCents / 100).toFixed(2)}). A lease cannot bill a negative amount — the lease was ` +
      `not imported. Check for a stray minus sign or a credit column mapped as rent.`))
  } else if (rentCents === 0) {
    issues.push(implausible("rent_amount_cents",
      "Rent is ZERO. The lease was imported, but it will invoice nothing. If this is a rent-free or " +
      "caretaker arrangement that is correct; otherwise the rent column may be empty or mis-mapped."))
  } else if (rentCents > RENT_CENTS_MAX) {
    issues.push(implausible("rent_amount_cents",
      `Rent is R${(rentCents / 100).toLocaleString("en-ZA")} a month, which is implausibly high. The commonest ` +
      `cause is a rands column read as cents (or the reverse). Check it before invoicing.`))
  }

  // ── Deposit.
  if (depositCents !== null && depositCents < 0) {
    issues.push(incoherent("deposit_amount_cents",
      `The deposit is NEGATIVE (${(depositCents / 100).toFixed(2)}). A deposit is money the agency HOLDS — it ` +
      `cannot be negative. The lease was not imported.`))
  } else if (depositCents !== null && rentCents > 0 && depositCents > rentCents * DEPOSIT_RENT_MULTIPLE_MAX) {
    issues.push(implausible("deposit_amount_cents",
      `The deposit is ${Math.round(depositCents / rentCents)}× the monthly rent, which is implausible (a deposit ` +
      `is normally 1–2 months). Check the units before this money reaches the trust ledger.`))
  }

  // ── Escalation. The number that compounds for the life of the lease.
  if (escalationPercent !== null) {
    if (escalationPercent < 0) {
      issues.push(implausible("escalation_percent",
        `The escalation is NEGATIVE (${escalationPercent}%), so the rent would FALL every year. That is lawful ` +
        `but very rare — check it is not a stray minus sign.`))
    } else if (escalationPercent > ESCALATION_PERCENT_MAX) {
      issues.push(implausible("escalation_percent",
        `The escalation is ${escalationPercent}% a year. Compounded over a lease that is enormous, and SA leases ` +
        `run 5–10%. Check for a misplaced decimal before the first escalation notice goes out.`))
    }
  }

  // ── Arrears interest. Charged to a tenant, so a wrong margin is money taken.
  if (arrearsMarginPercent !== null) {
    if (arrearsMarginPercent < 0) {
      issues.push(implausible("arrears_interest_margin_percent",
        `The arrears-interest margin is NEGATIVE (${arrearsMarginPercent}%). Check for a stray minus sign.`))
    } else if (arrearsMarginPercent > ARREARS_MARGIN_PERCENT_MAX) {
      issues.push(implausible("arrears_interest_margin_percent",
        `The arrears-interest margin is ${arrearsMarginPercent}% over prime. That is far beyond any real margin ` +
        `and is charged to the TENANT — check it before the first arrears run.`))
    }
  }

  return issues
}

/** Notice period and deposit-return deadline — the numbers that move a statutory CLOCK. */
function checkStatutoryClocks(lease: {
  noticePeriodDays: number | null; depositReturnDays: number | null
}): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = []
  const { noticePeriodDays, depositReturnDays } = lease

  // ── Notice period. A statutory clock: it decides when a notice to vacate is valid.
  if (noticePeriodDays !== null) {
    if (noticePeriodDays < 0) {
      issues.push(incoherent("notice_period_days",
        `The notice period is NEGATIVE (${noticePeriodDays} days). A notice period cannot run backwards, and it ` +
        `decides when a notice to vacate is VALID. The lease was not imported.`))
    } else if (noticePeriodDays > NOTICE_PERIOD_DAYS_MAX) {
      issues.push(implausible("notice_period_days",
        `The notice period is ${noticePeriodDays} days (over a year). Check it — it decides when a notice to ` +
        `vacate is valid.`))
    }
  }

  // ── Deposit return deadline. Also a statutory clock (RHA s5(3)).
  if (depositReturnDays !== null) {
    if (depositReturnDays < 0) {
      issues.push(incoherent("deposit_return_days",
        `The deposit-return deadline is NEGATIVE (${depositReturnDays} days). The lease was not imported.`))
    } else if (depositReturnDays > DEPOSIT_RETURN_DAYS_MAX) {
      issues.push(implausible("deposit_return_days",
        `The deposit-return deadline is ${depositReturnDays} days. RHA s5(3) works in 7/14/21 days — check it.`))
    }
  }

  return issues
}

/** The dates every downstream computation hangs off. */
function checkDates(lease: { startDate: string; endDate: string | null; todayISO: string }): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = []
  const { startDate, endDate, todayISO } = lease

  // ── Dates. A lease that ends before it starts corrupts EVERY date computation downstream: the CPA s14
  //    notice window, expiry, escalation reviews, deposit interest. It is not a lease.
  if (endDate && endDate < startDate) {
    issues.push(incoherent("lease_end",
      `The lease ENDS (${endDate}) BEFORE IT STARTS (${startDate}). The lease was not imported — every date the ` +
      `system computes from it (notice windows, expiry, escalation) would be nonsense. The two date columns are ` +
      `most likely swapped, or the day/month order is not what we read.`))
  }

  const earliest = `${Number(todayISO.slice(0, 4)) - LEASE_START_MAX_YEARS_AGO}${todayISO.slice(4)}`
  if (startDate < earliest) {
    issues.push(implausible("lease_start",
      `The lease starts in ${startDate.slice(0, 4)}, over ${LEASE_START_MAX_YEARS_AGO} years ago. That is almost ` +
      `certainly a date-format misread rather than history.`))
  }

  return issues
}

/** A shape check, not an RFC. It exists because this address is BOTH the dedup key and where the tenant's mail
 *  goes — a malformed one silently merges two people or silently reaches nobody. */
export function looksLikeEmail(value: string): boolean {
  // Hand-parsed, not a regex: the obvious pattern (`[^\s@]+@[^\s@]+\.[^\s@]{2,}`) backtracks super-linearly,
  // and this runs once per row of a 5 000-row book. Linear scan, no catastrophic input.
  const v = value.trim()
  if (!v || /\s/.test(v)) return false

  const at = v.indexOf("@")
  if (at <= 0 || at !== v.lastIndexOf("@")) return false     // exactly one @, not leading

  const domain = v.slice(at + 1)
  const dot = domain.lastIndexOf(".")
  if (dot <= 0) return false                                  // a dot, not leading
  return domain.length - dot - 1 >= 2                         // a TLD of at least two characters
}

// ── CSV / FORMULA INJECTION ──────────────────────────────────────────────────────────────────────

/**
 * Re-exported from the SSOT, NOT re-implemented. The rule now lives in lib/security/csvInjection.ts because it
 * is not an import concern: a tenant can type `=HYPERLINK(...)` straight into the application portal, and the
 * payload reaches the bookkeeper's Excel through any EXPORT, with no import anywhere in the story. Hardening
 * only the importer was guarding one door of a building with four.
 */
export { looksLikeFormula, neutraliseFormula } from "@/lib/security/csvInjection"
