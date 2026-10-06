/**
 * app/(applicant)/apply/invite/[token]/status/tracker.ts — what the lead's stage-2 tracker may claim, from the route's answer
 *
 * Notes:  A12. Pure, so the page's claims are testable without a browser: the page once rendered "Screening fee paid"
 *         for a token that resolved nothing. "Paid" comes only from the route's feePaid; a not-found answer is
 *         404/410/400 and nothing else — a 5xx or a network failure is "retry", never "this link is invalid".
 *         withdrawn is final like a decision, so the page stops polling it.
 */

export interface InviteStatus {
  reference: string
  stage2Status: string | null
  feePaid: boolean
  // The fee ACTUALLY charged, read from the application row — not the single-applicant constant, which
  // quoted R250 to a joint applicant who paid R470.
  feeCents: number | null
}

export const STEPS = [
  { key: "submitted", label: "Application submitted" },
  { key: "documents", label: "Documents uploaded" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "payment", label: "Payment received" },
  { key: "screening", label: "Background screening" },
  { key: "decision", label: "Decision" },
] as const

export function statusToStep(stage2Status: string | null, feePaid: boolean): number {
  if (stage2Status === "approved" || stage2Status === "declined") return 5
  if (stage2Status === "screening_complete") return 5
  if (stage2Status === "screening_in_progress") return 4
  if (feePaid) return 3
  return 2
}

export const isFinal = (s: string | null) => s === "approved" || s === "declined" || s === "withdrawn"

/** The line under the heading. Never "paid" unless the route said so. */
export function feeLine(status: InviteStatus, formatCents: (cents: number) => string): string {
  if (status.feePaid) return status.feeCents == null ? "Screening fee paid" : `Screening fee: ${formatCents(status.feeCents)} paid`
  if (status.stage2Status === "withdrawn") return "This application was withdrawn."
  return "We're confirming your payment — this page updates on its own. If it hasn't changed within an hour, contact the agent managing this listing."
}

/** How the page treats one poll's HTTP status. */
export function classifyResponse(httpStatus: number): "ok" | "missing" | "retry" {
  if (httpStatus >= 200 && httpStatus < 300) return "ok"
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 410) return "missing"
  return "retry"
}
