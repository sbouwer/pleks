/**
 * lib/screening/quote.ts — reads the current Searchworx rates and quotes a fee through the formula (ADDENDUM_14V §3.4, §4)
 *
 * Auth:   none of its own — callers are server routes/pages that have already authenticated the payer (token, ITN,
 *         gateway). It reads a platform table through the service client (lib/searchworx/rates/read.ts).
 * Data:   searchworx_rates via currentRates(); the formula in lib/screening/pricing.ts; PRICING_POLICY
 * Notes:  THE one server entry point to a fee. Every consumer either reads a stamp or calls this — none holds a
 *         number. FAIL-CLOSED (§4): no rate, or a rate read that fails, is a typed refusal plus a Sentry event,
 *         never a zero or a fallback literal. The caller renders "screening temporarily unavailable".
 *         A quote is not a stamp: callers that SHOW a fee for payment write `stampColumns(q)` once and reuse it
 *         (§3.5); display-only callers may quote freely.
 */
import * as Sentry from "@sentry/nextjs"
import { saTodayISO } from "@/lib/dates"
import { currentRates } from "@/lib/searchworx/rates/read"
import { applicantFeeCents, type PricingBundle, type Quote } from "@/lib/screening/pricing"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"
import { applicationBundle, singleProductBundle } from "@/lib/screening/searchworxBundle"

export type QuoteOk = Extract<Quote, { ok: true }>
export type ServerQuote = Quote | { ok: false; reason: "rates_unavailable" }

async function quoteBundle(bundle: PricingBundle, context: string, asAt: string = saTodayISO()): Promise<ServerQuote> {
  const keys = [...new Set([...bundle.entityProducts, ...bundle.personProducts])]
  let q: ServerQuote
  try {
    const { rates } = await currentRates(keys, asAt)
    q = applicantFeeCents({ bundle, rates, policy: PRICING_POLICY })
  } catch (e) {
    Sentry.captureException(e, { tags: { area: "screening-quote", context } })
    return { ok: false, reason: "rates_unavailable" }
  }
  if (!q.ok) {
    Sentry.captureMessage("Screening quote refused — no fee produced", {
      level: "error",
      tags: { area: "screening-quote", context, reason: q.reason },
      extra: { missing: q.reason === "no_rate" ? q.missing : undefined, asAt },
    })
  }
  return q
}

/** An application's screening fee: the entity line (juristic only) plus one SA bundle per natural person. */
export function quoteApplicationFee(args: { juristic: boolean; persons: number }, context: string): Promise<ServerQuote> {
  return quoteBundle(applicationBundle(args), context)
}

/**
 * A property-intelligence pull: one product (§3.4 last bullet). The PI product_type IS the rate product_key.
 *
 * @knipignore ADDENDUM_14V step 7 second slice: the PI initiate route quotes through this on the same branch.
 * Remove this tag with that caller.
 */
export function quotePropertyIntelligence(productKey: string, context: string): Promise<ServerQuote> {
  return quoteBundle(singleProductBundle(productKey), context)
}

/** The three stamp columns a quote leaves beside the fee it priced (§3.5). Same names on every stamped table. */
export function stampColumns(q: QuoteOk): {
  rate_effective_date: string
  pricing_policy_version: string
  cost_excl_vat_cents: number
} {
  return {
    rate_effective_date: q.rate_effective_date,
    pricing_policy_version: q.pricing_policy_version,
    cost_excl_vat_cents: q.cost_excl_cents,
  }
}
