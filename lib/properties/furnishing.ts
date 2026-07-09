/**
 * lib/properties/furnishing.ts — single source for furnishing status values + display labels
 *
 * Notes:  ADDENDUM_60C D-60C-07 — one canonical label set so a furnishing value reads the same
 *         everywhere (the drift was scenarios.ts "Partly furnished" vs StepUnits "Semi-furnished").
 *         Surfaces that DELIBERATELY differ keep their own labels: StepUniversal's compact
 *         No/Semi/Yes toggle, and r6 student housing's "Bed + desk provided". This is the standard set.
 */
export type FurnishingStatus = "unfurnished" | "semi_furnished" | "furnished"

export const FURNISHING_LABELS: Record<FurnishingStatus, string> = {
  unfurnished:    "Unfurnished",
  semi_furnished: "Partly furnished",
  furnished:      "Fully furnished",
}

export const FURNISHING_OPTIONS: ReadonlyArray<{ value: FurnishingStatus; label: string }> =
  (Object.keys(FURNISHING_LABELS) as FurnishingStatus[]).map((value) => ({
    value,
    label: FURNISHING_LABELS[value],
  }))

/** Display label for a furnishing value, with a safe fallback. */
export function furnishingLabel(value: string | null | undefined): string {
  return FURNISHING_LABELS[(value ?? "") as FurnishingStatus] ?? "Unfurnished"
}

/**
 * Default deposit MULTIPLE (× monthly rent) by furnishing (O-22). Seeds the LOW end of the practical range
 * (matches the point-estimates in buildProfile's DEPOSIT_MONTHS_BY_FURNISHING) — tenant-conservative, and the
 * agent can raise it within the range shown as guidance. numeric so the half-month (1.5) stays exact.
 */
export const DEPOSIT_MULTIPLE_BY_FURNISHING: Record<FurnishingStatus, number> = {
  unfurnished:    1,
  semi_furnished: 1.5,
  furnished:      2,
}

/** The practical range for each furnishing level — shown as guidance text next to the seeded default. */
export const DEPOSIT_MULTIPLE_RANGE_LABEL: Record<FurnishingStatus, string> = {
  unfurnished:    "typically 1–1.5× rent",
  semi_furnished: "typically 1.5–2× rent",
  furnished:      "typically 2–3× rent",
}

/** The furnishing-derived default deposit multiple, with a safe fallback (1× rent). */
export function defaultDepositMultiple(furnishing: string | null | undefined): number {
  return DEPOSIT_MULTIPLE_BY_FURNISHING[(furnishing ?? "") as FurnishingStatus] ?? 1
}
