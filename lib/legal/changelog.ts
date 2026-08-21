/**
 * lib/legal/changelog.ts — versioned changelog for ToS and Privacy Policy
 *
 * Notes:  INTENDED to be sourced by ConsentGateModal for section-level change highlights between
 *         the user's last-accepted version and the current version. As at 2026-08-20 nothing calls
 *         getTosHighlights or getPrivacyHighlights — ConsentGateModal imports the ChangeHighlight
 *         TYPE and renders a changeHighlights prop nobody supplies. The wiring is unbuilt, not
 *         broken, and this header previously asserted it as fact.
 *         PRIVACY_CHANGELOG is empty, so getPrivacyHighlights can only return null today;
 *         TOS_CHANGELOG carries drafted v3.4.0 copy and is the reason this module survived a
 *         dead-code sweep.
 *         Maintained manually per release — keyed as `from:to` version pairs.
 */

export interface ChangeHighlight {
  section: string
  summary: string
}

export interface ChangelogEntry {
  highlights: ChangeHighlight[]
}

/** Terms of Service changelog. Keys are "fromVersion:toVersion". */
const TOS_CHANGELOG: Record<string, ChangelogEntry> = {
  "v3.3.0:v3.4.0": {
    highlights: [
      { section: "§04", summary: "Cancellation and data retention terms" },
      { section: "§10", summary: "Subscription pause and dormancy policy" },
      { section: "§12", summary: "Data access rights during and after cancellation" },
    ],
  },
}

/** Privacy Policy changelog. Keys are "fromVersion:toVersion". */
const PRIVACY_CHANGELOG: Record<string, ChangelogEntry> = {}

/**
 * Returns change highlights between two ToS versions, or null if not catalogued.
 * @knipignore Kept because TOS_CHANGELOG carries live drafted v3.4.0 copy — the wiring is unbuilt, not broken.
 * A prior dead-code pass already decided this; see this module's header.
 */
export function getTosHighlights(
  fromVersion: string | null | undefined,
  toVersion: string,
): ChangeHighlight[] | null {
  if (!fromVersion) return null
  const key = `${fromVersion}:${toVersion}`
  return TOS_CHANGELOG[key]?.highlights ?? null
}

/**
 * Returns change highlights between two Privacy Policy versions, or null if not catalogued.
 * @knipignore See getTosHighlights above — same decision, same module header.
 */
export function getPrivacyHighlights(
  fromVersion: string | null | undefined,
  toVersion: string,
): ChangeHighlight[] | null {
  if (!fromVersion) return null
  const key = `${fromVersion}:${toVersion}`
  return PRIVACY_CHANGELOG[key]?.highlights ?? null
}
