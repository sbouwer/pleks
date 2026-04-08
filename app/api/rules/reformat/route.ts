import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { reformatRule } from "@/lib/rules/reformat"
import { TIER_REFORMAT_LIMITS } from "@/lib/rules/templates"

// POST /api/rules/reformat
// Body: { propertyId: string, text: string }
// Checks property-level credit limit, calls Haiku, increments counter.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as { propertyId?: string; text?: string }
  const { propertyId, text } = body

  if (!propertyId || !text?.trim()) {
    return NextResponse.json({ error: "propertyId and text are required" }, { status: 400 })
  }

  // Verify property belongs to this org
  const { data: property } = await supabase
    .from("properties")
    .select("id, ai_reformat_count, ai_reformat_bonus")
    .eq("id", propertyId)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()

  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 })

  // Get tier limit
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .single()

  const tier = (sub?.tier as string | null) ?? "steward"
  const limit = TIER_REFORMAT_LIMITS[tier] ?? 3
  const used = property.ai_reformat_count ?? 0
  const bonus = property.ai_reformat_bonus ?? 0
  const totalAllowed = limit + bonus

  if (limit === 0) {
    return NextResponse.json(
      { error: "AI reformat is not available on your plan" },
      { status: 403 }
    )
  }

  if (used >= totalAllowed) {
    return NextResponse.json(
      {
        error: "Credit limit reached",
        credits_used: used,
        credits_total: totalAllowed,
        credits_remaining: 0,
      },
      { status: 402 }
    )
  }

  // Call Haiku
  let formattedText: string
  try {
    formattedText = await reformatRule(text)
  } catch {
    return NextResponse.json({ error: "AI reformat failed" }, { status: 500 })
  }

  // Increment counter
  await supabase
    .from("properties")
    .update({ ai_reformat_count: used + 1 })
    .eq("id", propertyId)

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: membership.org_id,
    user_id: user.id,
    action: "ai_reformat_rule",
    entity_type: "property",
    entity_id: propertyId,
    metadata: { input_length: text.length },
  })

  const remaining = totalAllowed - (used + 1)

  return NextResponse.json({ formatted_text: formattedText, credits_remaining: remaining })
}
