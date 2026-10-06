/**
 * app/(dashboard)/listings/[slug]/compare/comparable.ts — which applications the compare page shows, and its link
 *
 * Notes:  A9. ONE predicate for the two places that must agree: the compare page's query and the listing page's
 *         decision to offer the link. A link offered over a set the page then filters to one row is a dead end.
 *         Plain module (not "use client") so the server listing page reads the VALUE, not a client reference.
 */

/** stage1_status values the compare page reads. */
export const COMPARABLE_STAGE1 = ["pre_screen_complete", "shortlisted"] as const

/** The page shows at most this many, highest pre-screen first. */
export const COMPARE_LIMIT = 8

export const isComparable = (stage1Status: string | null) =>
  (COMPARABLE_STAGE1 as readonly string[]).includes(stage1Status ?? "")

/** The compare link for a listing, or null when fewer than two applications are comparable. */
export function compareHref(slug: string, listingId: string, stage1Statuses: (string | null)[]): string | null {
  if (stage1Statuses.filter(isComparable).length < 2) return null
  return `/listings/${encodeURIComponent(slug)}/compare?listing=${encodeURIComponent(listingId)}`
}
