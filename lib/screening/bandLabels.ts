/**
 * lib/screening/bandLabels.ts — the FitScore band display names, one map
 *
 * Notes:  Moved out of lib/reports/screening/_primitives/theme.ts (which pulls @react-pdf/renderer) so that a web page —
 *         the applicant's result view (14X P5) — can name a band without loading the PDF renderer. theme.ts and the
 *         POPIA screening-response handler re-export / read this map rather than holding copies.
 */
import type { FitScoreBand } from "@/lib/screening/fitScoreEngine.v1"

export const BAND_LABELS: Record<FitScoreBand, string> = {
  verified_stability:   "Verified Stability",
  stable_profile:       "Stable Profile",
  cautious_review:      "Cautious Review",
  limited_confidence:   "Limited Confidence",
  adverse_signals:      "Adverse Signals",
  limited_data_profile: "Limited Data Profile",
  blocked:              "Blocked",
}
