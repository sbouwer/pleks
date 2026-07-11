/**
 * lib/leases/cpaRenewal.ts — the ONE computation of the CPA s14(2)(b)(ii) expiry-notification date
 *
 * Notes:  CPA s14(2)(b)(ii): the landlord must notify a consumer of an impending automatic renewal "not
 *         more than 80, nor less than 40, BUSINESS days before the expiry date." Before this helper the
 *         date was computed four different wrong ways — 40 CALENDAR days (lease creation + the cron), 28
 *         calendar days via local-time setDate (two lease-detail surfaces, one of them labelled "40-80
 *         business days" while computing 28 calendar), and 20 business days (the property page). Every one
 *         of them fired inside the statutorily-too-late zone or showed the agent a wrong date.
 *
 *         The target is the MIDDLE of the window (60 business days), not the floor. Twenty business days of
 *         slack on each side absorbs a missed public-holiday proclamation without leaving the lawful window;
 *         targeting the 40-day floor leaves no margin (see OUTSTANDING "CPA s14(2)(b)(ii)").
 *
 *         Evaluation-time, never stamped. `auto_renewal_notice_due` used to be frozen onto the row at lease
 *         CREATION, which is why the value went stale and wrong; the date is DERIVED where it is consumed
 *         (the cron for firing, the UI for display) so it self-heals and never drifts. See ADDENDUM_70K §6.
 */
import { subtractBusinessDaysStrict, isWithinHolidayHorizon } from "@/lib/dates"

/** Middle of the CPA s14(2)(b)(ii) 40–80 business-day window. */
export const CPA_S14_NOTICE_BUSINESS_DAYS = 60

/**
 * STATUTORY. The date the s14(2)(b)(ii) expiry notice is due, as "YYYY-MM-DD". Throws past the holiday
 * table's horizon (fail closed) — callers on the firing path must only pass leases whose end date sits
 * inside the horizon (the cron bands candidates to the next ~120 calendar days, comfortably inside it).
 */
export function cpaRenewalNoticeDue(endDateIso: string): string {
  return subtractBusinessDaysStrict(endDateIso, CPA_S14_NOTICE_BUSINESS_DAYS)
}

/**
 * DISPLAY. Same computation, but returns null instead of throwing when the end date is beyond the holiday
 * table's horizon — a lease ending in 2029 must not blank a page. The UI shows the date when it can be
 * computed and degrades to "available once the {year} table lands" when it cannot. (Mini Phase-D; the full
 * coverage-gated panel is ADDENDUM_70K Phase D.)
 */
export function cpaRenewalNoticeDueSafe(endDateIso: string | null): string | null {
  if (!endDateIso || !isWithinHolidayHorizon(endDateIso)) return null
  try {
    return cpaRenewalNoticeDue(endDateIso)
  } catch {
    // The backward walk itself crossed the horizon (end date near the table's lower edge).
    return null
  }
}
