// Bank reconciliation matching engine (D-014)
// Order: exact reference → fuzzy amount+date → AI (Haiku) → manual

export interface MatchResult {
  matchType: "matched_exact" | "matched_fuzzy" | "matched_ai" | "matched_manual"
  confidence: number
  invoiceId?: string | null
  supplierInvoiceId?: string | null
  description: string
  requiresConfirmation?: boolean
}

// Tier 1: Exact reference match
export async function matchExact(
  referenceClean: string | null,
): Promise<MatchResult | null> {
  if (!referenceClean) return null
  // TODO: Implement with Supabase query when rent_invoices have payment_reference field
  return null
}

// Tier 2: Fuzzy match — amount within R50 tolerance, date within 14 days
export async function matchFuzzy(): Promise<MatchResult | null> {
  // TODO: Implement with Supabase range queries
  return null
}

// Tier 3: Claude Haiku AI match
export async function matchAI(): Promise<MatchResult | null> {
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
): Promise<MatchResult | null> {
  // Tier 1
  const exact = await matchExact(line.reference_clean)
  if (exact) return exact

  // Tier 2
  const fuzzy = await matchFuzzy()
  if (fuzzy) return fuzzy

  // Tier 3
  const ai = await matchAI()
  if (ai) return ai

  // Tier 4: manual — handled in UI
  return null
}
