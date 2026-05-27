/**
 * lib/legal/changelog.ts — versioned changelog for ToS and Privacy Policy
 *
 * Notes:  Sourced by ConsentGateModal to show section-level change highlights between
 *         the user's last-accepted version and the current version.
 *         If no entry exists for a given (from → to) pair, ConsentGateModal falls back
 *         to a generic "We've updated our Terms" message.
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
export const TOS_CHANGELOG: Record<string, ChangelogEntry> = {
  "v3.3.0:v3.4.0": {
    highlights: [
      { section: "§04", summary: "Cancellation and data retention terms" },
      { section: "§10", summary: "Subscription pause and dormancy policy" },
      { section: "§12", summary: "Data access rights during and after cancellation" },
    ],
  },
}

/** Privacy Policy changelog. Keys are "fromVersion:toVersion". */
export const PRIVACY_CHANGELOG: Record<string, ChangelogEntry> = {}

/** Returns change highlights between two ToS versions, or null if not catalogued. */
export function getTosHighlights(
  fromVersion: string | null | undefined,
  toVersion: string,
): ChangeHighlight[] | null {
  if (!fromVersion) return null
  const key = `${fromVersion}:${toVersion}`
  return TOS_CHANGELOG[key]?.highlights ?? null
}

/** Returns change highlights between two Privacy Policy versions, or null if not catalogued. */
export function getPrivacyHighlights(
  fromVersion: string | null | undefined,
  toVersion: string,
): ChangeHighlight[] | null {
  if (!fromVersion) return null
  const key = `${fromVersion}:${toVersion}`
  return PRIVACY_CHANGELOG[key]?.highlights ?? null
}
