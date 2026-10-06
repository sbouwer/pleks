/**
 * app/(applicant)/apply/[slug]/documentCheck.ts — pure poll rules for the review's document-check card (A18).
 *
 * Notes:  Kept out of the "use client" component so the rules are unit-tested without a DOM. The card polls
 *         GET /api/applications/[id]/screen, which returns the applicant's to-dos only (never the ruling).
 */
import type { ScreenStatus } from "@/lib/applications/screeningJobs"

/** Only "processing" is worth polling; done / failed / none are settled until the applicant acts. */
export function shouldPoll(status: ScreenStatus | null): boolean {
  return status === null || status === "processing"
}

const FIRST_MS = 4_000
const CAP_MS = 30_000

/** Back-off between polls: 4s, 6s, 9s … capped at 30s. `attempt` counts polls already made (0-based). A network
 *  failure counts as an attempt too, so an offline applicant is polled less, never more. */
export function nextPollDelayMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt))
  return Math.min(CAP_MS, Math.round(FIRST_MS * 1.5 ** n))
}
