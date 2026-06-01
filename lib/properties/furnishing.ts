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
