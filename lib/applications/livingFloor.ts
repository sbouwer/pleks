/**
 * lib/applications/livingFloor.ts — household living-cost floor for the residual-income affordability override
 * (ADDENDUM_14M flag 0b). SSOT + Truth-Pipeline citation.
 *
 * NOT a poverty line — a living-wage / dignity instrument: the monthly NON-RENT essentials (nutritious food +
 * transport + electricity + basics) a household needs to live with dignity. Errs HIGH on purpose, so the
 * residual override only fires when income genuinely clears a generous bar. It is SURFACED, not determinative,
 * and flag 0b only ever RAISES affordability — so an imperfect figure can never auto-harm an applicant; that's
 * why "defensible" beats "precise" here.
 *
 * Two dependant classes carry different cost: an ADULT dependant ≈ a full adult's non-rent essentials; a MINOR
 * (child) ≈ half (2:1 weighting). adults below = all adult heads (earners + adult dependants).
 *
 * SOURCE — PMBEJD Household Affordability Index, May 2026 (https://pmbejd.org.za/index.php/household-affordability-index/):
 *   household food basket R5 479.26 · a worker's non-rent essentials (nutritious food R3 795.23 + electricity &
 *   transport R2 781.85) ≈ R6 577/household of ~4 · child nutritious food R967.08. The per-adult floor below is
 *   the non-rent essentials for one adult (food + transport + electricity share + basics), rounded up.
 *   ⚠ REFRESH periodically: PMBEJD publishes monthly and these figures move. Update perAdult/perDependent +
 *   effectiveMonth from the latest index; the value is snapshotted onto each evaluation at screen time.
 */
export const LIVING_FLOOR = {
  source: "PMBEJD Household Affordability Index",
  effectiveMonth: "2026-05",
  sourceUrl: "https://pmbejd.org.za/index.php/household-affordability-index/",
  perAdultCents: 350_000,   // R3 500 — non-rent essentials per adult head (earner or adult dependant); err-high
  perMinorCents: 175_000,   // R1 750 — a minor (child) ≈ half an adult (2:1 weighting)
} as const

/** Monthly NON-RENT living floor for a household (cents). adults = all adult heads (earners + adult dependants),
 *  clamped ≥ 1; minors (children) ≥ 0, costed at half. */
export function householdLivingFloorCents(adults: number, minors: number): number {
  const a = Math.max(1, Math.floor(adults || 0))
  const m = Math.max(0, Math.floor(minors || 0))
  return a * LIVING_FLOOR.perAdultCents + m * LIVING_FLOOR.perMinorCents
}
