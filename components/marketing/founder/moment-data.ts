/**
 * components/marketing/founder/moment-data.ts — the shape of one founder-timeline moment
 *
 * Notes:  Lives apart from FounderTimeline so FounderMoment can import the type without importing
 *         its own parent. FounderTimeline declared this type and rendered FounderMoment, which
 *         imported it back — a circular import that compiled only because the edge is type-only
 *         and TypeScript erases it. Keep the declaration here; a re-export from the timeline would
 *         restore the cycle for anyone who used it.
 */
export type MomentData = {
  id: number
  side: "left" | "right"
  year: string
  tag: string
  tagColour: "slate" | "amber"
  title: string
  body: string
  /** Optional substring of `body` to wrap in `.amber-wash-underline`. Must match exactly. */
  bodyHighlight?: string
  foot: string
  phase: "slate" | "amber" | "now"
}
