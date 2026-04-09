// Bank reconciliation matching engine (D-014)
// Order: exact reference → fuzzy amount+date → AI (Haiku) → manual

import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface MatchResult {
  matchType: "matched_exact" | "matched_fuzzy" | "matched_ai" | "matched_manual"
  confidence: number
  invoiceId?: string | null
  supplierInvoiceId?: string | null
  description: string
  requiresConfirmation?: boolean
}

export interface MatchContext {
  db: SupabaseClient
  orgId: string
}

/** Normalise a reference string for comparison: uppercase, strip spaces/dashes/dots */
function normalise(s: string): string {
  return s.toUpperCase().replace(/[\s\-_.]/g, "")
}

// Tier 1: Exact reference match against invoice_number
export async function matchExact(
  referenceClean: string | null,
  ctx: MatchContext,
): Promise<MatchResult | null> {
  if (!referenceClean?.trim()) return null

  const normRef = normalise(referenceClean)
  if (normRef.length < 3) return null  // too short to be meaningful

  // Fetch open/overdue invoices for this org
  const { data: invoices } = await ctx.db
    .from("rent_invoices")
    .select("id, invoice_number, balance_cents, total_amount_cents")
    .eq("org_id", ctx.orgId)
    .in("status", ["open", "partial", "overdue"])

  if (!invoices?.length) return null

  for (const inv of invoices) {
    if (!inv.invoice_number) continue
    const normInv = normalise(inv.invoice_number as string)
    if (normRef === normInv || normRef.includes(normInv) || normInv.includes(normRef)) {
      return {
        matchType: "matched_exact",
        confidence: normRef === normInv ? 1.0 : 0.95,
        invoiceId: inv.id as string,
        description: `Invoice ${inv.invoice_number} matched by reference`,
        requiresConfirmation: normRef !== normInv,
      }
    }
  }

  return null
}

// Tier 2: Fuzzy match — amount within R50 tolerance, date within 14 days
export async function matchFuzzy(
  line: {
    amount_cents: number
    transaction_date: string
    direction: "credit" | "debit"
  },
  ctx: MatchContext,
): Promise<MatchResult | null> {
  // Only credits are tenant payments
  if (line.direction !== "credit") return null

  const AMOUNT_TOLERANCE = 5000  // ±R50 in cents
  const DATE_WINDOW_DAYS = 14

  const txDate = new Date(line.transaction_date)
  const dateFrom = new Date(txDate)
  dateFrom.setDate(txDate.getDate() - DATE_WINDOW_DAYS)
  const dateTo = new Date(txDate)
  dateTo.setDate(txDate.getDate() + DATE_WINDOW_DAYS)

  const { data: invoices } = await ctx.db
    .from("rent_invoices")
    .select("id, invoice_number, balance_cents, total_amount_cents, due_date")
    .eq("org_id", ctx.orgId)
    .in("status", ["open", "partial", "overdue"])
    .gte("balance_cents", line.amount_cents - AMOUNT_TOLERANCE)
    .lte("balance_cents", line.amount_cents + AMOUNT_TOLERANCE)
    .gte("due_date", dateFrom.toISOString().split("T")[0])
    .lte("due_date", dateTo.toISOString().split("T")[0])

  if (!invoices?.length) return null

  // Score each candidate — pick highest confidence
  let best: MatchResult | null = null

  for (const inv of invoices) {
    const amountDiff = Math.abs((inv.balance_cents as number) - line.amount_cents)
    const invDueDate = new Date(inv.due_date as string)
    const daysDiff = Math.abs((txDate.getTime() - invDueDate.getTime()) / (1000 * 60 * 60 * 24))

    // Base confidence 0.80; penalise R10 increments and each day off
    const amountPenalty = Math.floor(amountDiff / 1000) * 0.02
    const datePenalty   = Math.floor(daysDiff) * 0.01
    const confidence    = Math.max(0.55, 0.80 - amountPenalty - datePenalty)

    if (!best || confidence > best.confidence) {
      best = {
        matchType: "matched_fuzzy",
        confidence,
        invoiceId: inv.id as string,
        description: `Invoice ${inv.invoice_number} matched by amount ±R${Math.round(amountDiff / 100)} / ${Math.round(daysDiff)}d`,
        requiresConfirmation: true,
      }
    }
  }

  return best
}

// Tier 3: Claude Haiku AI match
export async function matchAI(
  line: {
    reference_clean: string | null
    description_clean: string | null
    amount_cents: number
    transaction_date: string
  },
  ctx: MatchContext,
): Promise<MatchResult | null> {
  const { data: invoices } = await ctx.db
    .from("rent_invoices")
    .select("id, invoice_number, balance_cents, due_date")
    .eq("org_id", ctx.orgId)
    .in("status", ["open", "partial", "overdue"])
    .limit(50)

  if (!invoices?.length) return null

  const candidates = invoices
    .map((inv, i) =>
      `${i + 1}. Invoice ${inv.invoice_number} | Due: ${inv.due_date} | Balance: R${(Math.round(inv.balance_cents as number) / 100).toFixed(2)}`
    )
    .join("\n")

  const client = new Anthropic()
  let rawText: string
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      system:
        'You are a bank reconciliation assistant. Given a bank transaction and open invoices, determine if the transaction matches one. Respond with JSON only: {"match":<1-based index or null>,"confidence":<0.0-1.0>,"reason":"<short>"}. Only match if confidence ≥ 0.65.',
      messages: [
        {
          role: "user",
          content: [
            `Transaction:`,
            `  Reference: ${line.reference_clean ?? "(none)"}`,
            `  Description: ${line.description_clean ?? "(none)"}`,
            `  Amount: R${(line.amount_cents / 100).toFixed(2)}`,
            `  Date: ${line.transaction_date}`,
            ``,
            `Open invoices:`,
            candidates,
          ].join("\n"),
        },
      ],
    })
    const block = msg.content[0]
    if (block.type !== "text") return null
    rawText = block.text
  } catch {
    return null
  }

  try {
    // Extract JSON — Haiku may wrap it in markdown fences
    const jsonStart = rawText.indexOf("{")
    const jsonEnd = rawText.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd <= jsonStart) return null
    const result = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1)) as { match: number | null; confidence: number; reason: string }
    if (!result.match || result.confidence < 0.65) return null
    const matched = invoices[result.match - 1]
    if (!matched) return null
    return {
      matchType: "matched_ai",
      confidence: result.confidence,
      invoiceId: matched.id as string,
      description: `Invoice ${matched.invoice_number} — AI: ${result.reason}`,
      requiresConfirmation: true,
    }
  } catch {
    return null
  }
}

// Run all tiers in order for a single bank statement line
export async function runMatchingPipeline(
  line: {
    reference_clean: string | null
    description_clean: string | null
    amount_cents: number
    direction: "credit" | "debit"
    transaction_date: string
  },
  ctx: MatchContext,
): Promise<MatchResult | null> {
  // Only match credits (incoming tenant payments)
  if (line.direction !== "credit") return null

  // Tier 1
  const exact = await matchExact(line.reference_clean, ctx)
  if (exact) return exact

  // Tier 2
  const fuzzy = await matchFuzzy(line, ctx)
  if (fuzzy) return fuzzy

  // Tier 3
  const ai = await matchAI(line, ctx)
  if (ai) return ai

  // Tier 4: manual — handled in UI
  return null
}
