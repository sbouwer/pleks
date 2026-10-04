/**
 * lib/screening/retryPlan.ts — after a screening run, decide per product: delivered, retry, or terminal (ADDENDUM_14W §0c)
 *
 * Data:   none — pure over the run's application_screening_lines rows
 * Notes:  14W §9 row 55: a failed PRODUCT line is retried on a bounded schedule; a subject is complete only when every
 *         product it ran is delivered or terminal; a terminal product is the refund trigger for that product's share.
 *         "Delivered" is a `completed` line, or a `skipped` one (VCCB for a foreign national: the product does not
 *         exist for them, so there is nothing to retry). The attempt count is the number of `failed` lines for the
 *         product in the run — every attempt inserts its own line, so the rows ARE the counter.
 *         A product with no delivered line and fewer failures than the bound is retried; the whole subject waits for
 *         it, so the assessment never runs on a report that is still coming.
 */
import { SCREENING_PRODUCT_MAX_ATTEMPTS } from "@/lib/constants"

export interface RunLine {
  product_key: string
  status: string
}

export type RunPlan =
  | { action: "retry"; retrying: string[]; delivered: string[] }
  | { action: "settle"; delivered: string[]; completed: string[]; terminal: string[] }

const DELIVERED = new Set(["completed", "skipped"])

export function planRun(lines: readonly RunLine[], maxAttempts: number = SCREENING_PRODUCT_MAX_ATTEMPTS): RunPlan {
  const byProduct = new Map<string, { delivered: boolean; completed: boolean; failed: number }>()
  for (const l of lines) {
    const p = byProduct.get(l.product_key) ?? { delivered: false, completed: false, failed: 0 }
    if (DELIVERED.has(l.status)) p.delivered = true
    if (l.status === "completed") p.completed = true
    else if (l.status === "failed") p.failed++
    byProduct.set(l.product_key, p)
  }

  const delivered: string[] = []
  const completed: string[] = []
  const retrying: string[] = []
  const terminal: string[] = []
  for (const [key, p] of byProduct) {
    if (p.completed) completed.push(key)
    if (p.delivered) delivered.push(key)
    else if (p.failed >= maxAttempts) terminal.push(key)
    else if (p.failed > 0) retrying.push(key)
  }
  return retrying.length > 0
    ? { action: "retry", retrying, delivered }
    : { action: "settle", delivered, completed, terminal }
}
