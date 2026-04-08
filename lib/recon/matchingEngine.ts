// Bank reconciliation matching engine (D-014)
// Order: exact reference → fuzzy amount+date → AI (Haiku) → manual

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
  _line: {
    amount_cents: number
    transaction_date: string
    direction: "credit" | "debit"
  },
  _ctx: MatchContext,
): Promise<MatchResult | null> {
  // TODO: Implement with Supabase range queries
  return null
}

// Tier 3: Claude Haiku AI match
export async function matchAI(
  _line: {
    reference_clean: string | null
    description_clean: string | null
    amount_cents: number
    transaction_date: string
  },
  _ctx: MatchContext,
): Promise<MatchResult | null> {
  // TODO: Implement with Anthropic API (Haiku 4.5)
  return null
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
