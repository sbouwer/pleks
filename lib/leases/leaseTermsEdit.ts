/**
 * lib/leases/leaseTermsEdit.ts — validate a draft lease's edited terms into a leases UPDATE patch. PURE: no DB, no auth.
 *
 * Notes:  The terms the activation prerequisites send an agent back to fix (dates, rent, deposit) plus the money terms
 *         beside them on the details tab. Kept out of lib/actions/leases.ts because a "use server" module may only
 *         export async functions.
 *         Unlike parseLeaseFormData (the wizard), nothing here defaults a money term: a blank escalation or notice
 *         period is refused, not filled with 10% / 20 days, because an edit that silently rewrites a term the agent
 *         did not touch is worse than an error.
 *         ESCALATION_TYPES is the leases.escalation_type CHECK (004: fixed | cpi | prime_plus), read on prod
 *         2026-10-09 (leases_escalation_type_check); a test holds it to scripts/schema-manifest.json.
 *         escalation_review_date is NOT in the patch: it is a stored term (an import can state its own), so the
 *         action re-derives it only when the start date moves.
 */

export const ESCALATION_TYPES = [
  { value: "fixed", label: "Fixed %" },
  { value: "cpi", label: "CPI-linked" },
  { value: "prime_plus", label: "Prime-linked" },
] as const

/**
 * The types an agent may CHOOSE. The Pleks lease document renders every escalation as "X% per annum"
 * (generateDocument.ts ignores escalation_type), so a CPI or prime-linked choice would sign a document stating a
 * fixed rate. Until the template renders by type, only fixed is offered; a lease already stored with another
 * type (an import) keeps it — the edit form shows its current value too.
 */
export const SELECTABLE_ESCALATION_TYPES = ESCALATION_TYPES.filter((t) => t.value === "fixed")

const DUE_DAYS = new Set([...Array.from({ length: 28 }, (_, i) => String(i + 1)), "last_day", "last_working_day"])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface LeaseTermsInput {
  startDate: string
  endDate: string
  isFixedTerm: boolean
  rent: string
  deposit: string
  paymentDueDay: string
  escalationPercent: string
  escalationType: string
  noticePeriodDays: string
}

export interface LeaseTermsPatch {
  start_date: string
  end_date: string | null
  is_fixed_term: boolean
  rent_amount_cents: number
  deposit_amount_cents: number | null
  payment_due_day: string
  escalation_percent: number
  escalation_type: string
  notice_period_days: number
}

/** A plain decimal ("12500", "8.5", "0"), or null when blank or anything else — Number() would take "0x10" or "1e3". */
function statedNumber(raw: string): number | null {
  const t = raw.trim()
  return /^\d+(\.\d+)?$/.test(t) ? Number.parseFloat(t) : null
}

const toCents = (rands: number) => Math.round(rands * 100)

function parseDates(input: LeaseTermsInput): { start: string; end: string | null } | { error: string } {
  const start = input.startDate.trim()
  if (!ISO_DATE.test(start)) return { error: "Add the lease start date." }
  if (!input.isFixedTerm) return { start, end: null }
  const end = input.endDate.trim()
  if (!ISO_DATE.test(end)) return { error: "Add the end date, or make the lease month-to-month." }
  if (end <= start) return { error: "The end date must be after the start date." }
  return { start, end }
}

function parseMoney(input: LeaseTermsInput): { rentCents: number; depositCents: number | null } | { error: string } {
  const rent = statedNumber(input.rent)
  if (rent === null || rent <= 0) return { error: "Add the monthly rent." }
  if (!input.deposit.trim()) return { rentCents: toCents(rent), depositCents: null }
  const deposit = statedNumber(input.deposit)
  if (deposit === null) return { error: "The deposit must be an amount of R0 or more." }
  return { rentCents: toCents(rent), depositCents: toCents(deposit) }
}

function parseEscalationAndNotice(input: LeaseTermsInput):
  { percent: number; type: string; dueDay: string; notice: number } | { error: string } {
  const percent = statedNumber(input.escalationPercent)
  if (percent === null || percent > 100) return { error: "Escalation must be a percentage from 0 to 100." }
  if (!ESCALATION_TYPES.some((t) => t.value === input.escalationType)) return { error: "Choose how the rent escalates." }
  if (!DUE_DAYS.has(input.paymentDueDay)) return { error: "Choose the day rent is due." }
  const notice = statedNumber(input.noticePeriodDays)
  if (notice === null || !Number.isInteger(notice)) return { error: "The notice period must be a whole number of days." }
  return { percent, type: input.escalationType, dueDay: input.paymentDueDay, notice }
}

export function parseLeaseTermsEdit(input: LeaseTermsInput): { patch: LeaseTermsPatch } | { error: string } {
  const dates = parseDates(input)
  if ("error" in dates) return dates
  const money = parseMoney(input)
  if ("error" in money) return money
  const terms = parseEscalationAndNotice(input)
  if ("error" in terms) return terms
  return {
    patch: {
      start_date: dates.start,
      end_date: dates.end,
      is_fixed_term: input.isFixedTerm,
      rent_amount_cents: money.rentCents,
      deposit_amount_cents: money.depositCents,
      payment_due_day: terms.dueDay,
      escalation_percent: terms.percent,
      escalation_type: terms.type,
      notice_period_days: terms.notice,
    },
  }
}

/** The patch's keys whose value differs from the lease as stored — what the audit row and the stale-document rule read. */
export function changedTerms(before: Record<string, unknown>, patch: LeaseTermsPatch): (keyof LeaseTermsPatch)[] {
  return (Object.keys(patch) as (keyof LeaseTermsPatch)[]).filter((k) => {
    const was = before[k]
    const now = patch[k]
    if (typeof now === "number" && was != null) return Number(was) !== now
    return (was ?? null) !== now
  })
}
