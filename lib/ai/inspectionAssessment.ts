// AI assessment for inspection module
// Track A: Claude Sonnet 4.6 for Steward+ (ai_inspection)
// Track B: keyword-based fallback for Owner tier (zero API cost)

import type { Tier } from "@/lib/constants"
import { hasFeature } from "@/lib/tier/gates"

export const WEAR_AND_TEAR_SYSTEM_PROMPT = `You are a South African property inspection expert with deep knowledge of the Rental Housing Act 50 of 1999 and industry standards for wear and tear assessment.

WEAR AND TEAR RULES (RHA):
- Normal wear and tear CANNOT be deducted from a tenant's deposit under any circumstances. This is a statutory prohibition.
- Wear and tear is deterioration through normal use, consistent with the age and quality of the item.
- Tenant DAMAGE is deterioration beyond normal use — negligence, misuse, or deliberate damage.

CLASSIFICATION GUIDE:
- wear_and_tear: Faded paint, small scuff marks, carpet wearing in high-traffic areas, worn door frame edges. TENANCY LENGTH MATTERS — a 3-year tenancy will show more wear than 6 months.
- tenant_damage: Large holes in walls, burns on carpets, broken windows (not storm), pet damage, excessive dirt beyond normal use.
- pre_existing: Damage noted at move-in inspection. Cannot be charged to tenant.
- acceptable: Item is in condition consistent with age and use.

DEDUCTION ESTIMATES:
Provide realistic ZAR market-rate estimates for the South African market. Factor in item age — a 10-year-old carpet cannot be replaced at full cost.

ALWAYS respond in valid JSON matching the schema provided.`

export const COMMERCIAL_DILAPIDATIONS_SYSTEM_PROMPT = `You are a South African commercial property expert assessing dilapidations at the end of a commercial lease. The lease agreement governs — not the Rental Housing Act.

DILAPIDATION ASSESSMENT:
- fair_wear: Normal deterioration consistent with commercial use and lease duration.
- dilapidation: Condition below lease standard, beyond fair wear. Subject to reinstatement.
- make_good_required: Tenant must restore to original condition per lease (remove partitions, reinstate carpet, etc.).
- tenant_improvement_retained: Fit-out improvement landlord agreed to keep.
- tenant_improvement_remove: Fit-out improvement tenant must remove and reinstate.
- pre_existing: Noted at lease commencement. Not attributable to tenant.
- acceptable: Within expected lease-end condition.

REINSTATEMENT COSTS:
Provide commercial-market ZAR estimates. Include contractor rates, materials, and professional fees where applicable.

ALWAYS respond in valid JSON matching the schema provided.`

export interface AssessmentResult {
  item_id: string
  classification: string
  deduction_cents: number
  justification: string
}

interface InspectionItem {
  id: string
  item_name: string
  item_category: string
  condition: string | null
  condition_notes: string | null
  room_label: string
}

export async function runInspectionAssessment(
  inspectionId: string,
  leaseType: "residential" | "commercial",
  orgId: string,
  tier: Tier
): Promise<AssessmentResult[]> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()

  // Get inspection items that need assessment
  const { data: items } = await supabase
    .from("inspection_items")
    .select("id, item_name, item_category, condition, condition_notes, inspection_rooms(room_label)")
    .eq("inspection_id", inspectionId)
    .in("condition", ["poor", "damaged", "fair"])

  if (!items?.length) return []

  const mapped: InspectionItem[] = items.map((item) => ({
    id: item.id,
    item_name: item.item_name,
    item_category: item.item_category,
    condition: item.condition,
    condition_notes: item.condition_notes,
    room_label: (item.inspection_rooms as unknown as { room_label: string } | null)?.room_label ?? "Unknown",
  }))

  // Track B — Owner tier: returns requires_review (zero API cost)
  if (!hasFeature(tier, "ai_inspection")) {
    return mapped.map((item) => ({
      item_id: item.id,
      classification: "requires_review",
      deduction_cents: 0,
      justification: "Manual review required — AI assessment available on Steward plan and above.",
    }))
  }

  // Track A — Steward+ tier: Claude Sonnet 4.6
  if (!process.env.ANTHROPIC_API_KEY) {
    return mapped.map((item) => ({
      item_id: item.id,
      classification: "requires_review",
      deduction_cents: 0,
      justification: "AI assessment unavailable — Anthropic API key not configured.",
    }))
  }

  // Get lease duration for context
  const { data: inspection } = await supabase
    .from("inspections")
    .select("lease_id")
    .eq("id", inspectionId)
    .single()

  let leaseDurationMonths = 12
  if (inspection?.lease_id) {
    const { data: lease } = await supabase
      .from("leases")
      .select("start_date, end_date")
      .eq("id", inspection.lease_id)
      .single()

    if (lease?.start_date && lease?.end_date) {
      leaseDurationMonths = Math.round(
        (new Date(lease.end_date).getTime() - new Date(lease.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
    }
  }

  const systemPrompt = leaseType === "commercial"
    ? COMMERCIAL_DILAPIDATIONS_SYSTEM_PROMPT
    : WEAR_AND_TEAR_SYSTEM_PROMPT

  const itemDescriptions = mapped.map((item, i) => (
    `${i + 1}. Room: ${item.room_label} | Item: ${item.item_name} (${item.item_category}) | Condition: ${item.condition} | Notes: ${item.condition_notes ?? "none"}`
  )).join("\n")

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const anthropic = new Anthropic()

    const residentialClassifications = "wear_and_tear|tenant_damage|pre_existing|acceptable"
    const commercialClassifications = "fair_wear|dilapidation|make_good_required|tenant_improvement_retained|tenant_improvement_remove|pre_existing|acceptable"

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `Assess the following ${mapped.length} inspection items.
Lease type: ${leaseType}
Lease duration: ${leaseDurationMonths} months

Items:
${itemDescriptions}

For each item, respond with a JSON array:
[
  {
    "item_index": 1,
    "classification": "${leaseType === "residential" ? residentialClassifications : commercialClassifications}",
    "deduction_cents": integer (0 if not deductible),
    "justification": "2-3 sentences explaining classification"
  }
]

Return ONLY the JSON array.`,
      }],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""
    const jsonStart = responseText.indexOf("[")
    const jsonEnd = responseText.lastIndexOf("]")

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return mapped.map((item) => ({
        item_id: item.id,
        classification: "requires_review",
        deduction_cents: 0,
        justification: "AI response could not be parsed — manual review required.",
      }))
    }

    const parsed = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1)) as Array<{
      item_index: number
      classification: string
      deduction_cents: number
      justification: string
    }>

    return parsed.map((result) => {
      const item = mapped[result.item_index - 1]
      if (!item) return null
      return {
        item_id: item.id,
        classification: result.classification,
        deduction_cents: result.deduction_cents ?? 0,
        justification: result.justification ?? "",
      }
    }).filter((r): r is AssessmentResult => r !== null)
  } catch {
    return mapped.map((item) => ({
      item_id: item.id,
      classification: "requires_review",
      deduction_cents: 0,
      justification: "AI assessment failed — manual review required.",
    }))
  }
}
