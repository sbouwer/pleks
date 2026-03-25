"use server"

import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"

const WEAR_TEAR_SYSTEM_PROMPT = `You are a South African property management specialist writing itemised deduction justifications for a deposit reconciliation.

CRITICAL LEGAL CONTEXT:
- The Rental Housing Act 50 of 1999 (s5) does NOT permit deductions for normal wear and tear.
- Only ACTUAL DAMAGE caused by the tenant (beyond normal use) is deductible.
- Wear and tear = gradual deterioration from normal use over time (e.g. faded paint, worn carpets)
- Damage = harm caused by negligence, misuse, or deliberate action

TONE AND FORMAT:
- Write formally — this document may be used in Rental Housing Tribunal proceedings
- Be factual and specific — describe what was found, why it is damage not wear and tear
- Reference both move-in and move-out conditions where photos exist
- Do NOT use subjective or emotional language
- Each justification: 2-4 sentences maximum
- The landlord bears the onus of proof — write to support that onus`

export async function generateDeductionJustification(deductionItemId: string) {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from("deposit_deduction_items")
    .select("id, lease_id, room, item_description, classification, deduction_amount_cents, quote_amount_cents")
    .eq("id", deductionItemId)
    .single()

  if (!item || item.classification !== "tenant_damage") return

  if (!process.env.ANTHROPIC_API_KEY) {
    await supabase.from("deposit_deduction_items").update({
      ai_justification: "AI justification unavailable — Anthropic API key not configured.",
      ai_justification_at: new Date().toISOString(),
      ai_model: "manual",
    }).eq("id", deductionItemId)
    return
  }

  // Get lease duration
  const { data: lease } = await supabase
    .from("leases")
    .select("start_date, end_date")
    .eq("id", item.lease_id)
    .single()

  const leaseDuration = lease?.start_date && lease?.end_date
    ? Math.round((new Date(lease.end_date).getTime() - new Date(lease.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 12

  const anthropic = new Anthropic()
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 300,
    system: WEAR_TEAR_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Write a deduction justification for this item.

Room: ${item.room ?? "Not specified"}
Item: ${item.item_description}
Lease duration: ${leaseDuration} months
${item.deduction_amount_cents > 0 ? `Deduction amount: R${(item.deduction_amount_cents / 100).toFixed(2)}` : ""}
${item.quote_amount_cents ? `Quote obtained: R${(item.quote_amount_cents / 100).toFixed(2)}` : ""}

Write 2-4 sentences justifying why this is tenant damage (not normal wear and tear) and why the deduction amount is reasonable. Be specific and factual.`,
    }],
  })

  const justification = message.content[0].type === "text"
    ? message.content[0].text.trim() : ""

  await supabase.from("deposit_deduction_items").update({
    ai_justification: justification,
    ai_justification_at: new Date().toISOString(),
    ai_model: "claude-sonnet-4-6",
  }).eq("id", deductionItemId)
}
