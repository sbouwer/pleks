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
 *
 *         ── PERSISTED STATUTORY-DATE COLUMN REGISTRY (ADDENDUM_70K Phase E) ──
 *         A "persisted statutory-date column" stores a LEGAL DEADLINE on a row (as opposed to deriving it
 *         when consumed). The registry is the fence: any addition needs a CD ruling naming why evaluation-
 *         time computation is impossible — because the strongest fence is structural, a column that cannot
 *         exist cannot be stamped wrong.
 *           REGISTRY: (empty — `leases.auto_renewal_notice_due` was dropped in 004 §ADDENDUM_70K Phase E)
 *         Enforced by process (the PR-template checklist line), not a lint rule — there is nothing left to
 *         match, and a column ADD is a schema-review event, not a code-grep one.
 */
import { subtractBusinessDaysStrict, isWithinHolidayHorizon } from "@/lib/dates"

/** Middle of the CPA s14(2)(b)(ii) 40–80 business-day window — the DUE date (a forward reminder target). */
export const CPA_S14_NOTICE_BUSINESS_DAYS = 60

/** Floor of the window — the LAST lawful day to serve the notice (40 business days before expiry). Distinct
 *  from the 60-bd target: the target is when we NUDGE, the floor is when the window CLOSES. A "notice missed"
 *  signal must use the floor, never the target — firing off the 60-bd target would flag a lease as missed
 *  while ~20 business days of lawful window remain. */
export const CPA_S14_NOTICE_FLOOR_BUSINESS_DAYS = 40

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

/**
 * STATUTORY. The 40-business-day floor — the last lawful day to serve the s14 notice. The window is CLOSED
 * (and, if the notice was never sent, MISSED) once today is strictly past this date. Throws past the horizon.
 */
export function cpaRenewalNoticeFloor(endDateIso: string): string {
  return subtractBusinessDaysStrict(endDateIso, CPA_S14_NOTICE_FLOOR_BUSINESS_DAYS)
}

/** DISPLAY. The floor date, or null past the holiday horizon (same fail-closed shape as cpaRenewalNoticeDueSafe).
 *  Feed it to `isRenewalNoticeMissed` for the "notice missed" signal. */
export function cpaRenewalNoticeFloorSafe(endDateIso: string | null): string | null {
  if (!endDateIso || !isWithinHolidayHorizon(endDateIso)) return null
  try {
    return cpaRenewalNoticeFloor(endDateIso)
  } catch {
    return null
  }
}

/**
 * The "renewal notice missed" invariant, as one tested predicate so the boundary can never silently slip.
 * MISSED ⇔ the 40-bd floor exists AND today is STRICTLY past it. The strictness is statutory: s14(2)(b)(ii)
 * says "not less than 40 business days before expiry", so serving ON the floor day (exactly 40 bd out) is
 * lawful — `today === floor` is NOT a miss; only `floor < today` is. A `<=` here would declare a miss on a
 * day the agent can still lawfully serve. A null floor (end date past the holiday-table horizon) is not a
 * miss — the advisory alert is simply absent, and the sentinel cron keeps coverage ≥ ~6 months ahead so a
 * null floor cannot coincide with a real, relevant miss. Type-guards `floorISO` to string on true.
 */
export function isRenewalNoticeMissed(floorISO: string | null, todayISO: string): floorISO is string {
  return floorISO !== null && floorISO < todayISO
}
