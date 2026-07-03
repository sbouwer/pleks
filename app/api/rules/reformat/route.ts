/**
 * app/api/rules/reformat/route.ts — AI-reformat a property house-rule (Haiku), metered per property
 *
 * Route:  POST /api/rules/reformat  { propertyId, text }
 * Auth:   requireAgentWriteAccess("reformat_rules") — a billable AI generation, so subscription-lockdown
 *         gated; additionally metered by a per-property credit limit + tier availability.
 * Data:   properties (org-scoped; reads + increments ai_reformat_count), audit_log via recordAudit.
 * Notes:  Lockdown surfaces as a clean 403 ({ code: "subscription_locked" }); credit limit → 402.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { recordAudit } from "@/lib/audit/recordAudit"
import { reformatRule } from "@/lib/rules/reformat"
import { TIER_REFORMAT_LIMITS } from "@/lib/rules/templates"
import { logQueryError } from "@/lib/supabase/logQueryError"

// POST /api/rules/reformat
// Body: { propertyId: string, text: string }
// Checks property-level credit limit, calls Haiku, increments counter.
export async function POST(req: NextRequest) {
  let gw
  try {
    gw = await requireAgentWriteAccess("reformat_rules")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, userId, orgId, tier } = gw

  const body = await req.json() as { propertyId?: string; text?: string }
  const { propertyId, text } = body

  if (!propertyId || !text?.trim()) {
    return NextResponse.json({ error: "propertyId and text are required" }, { status: 400 })
  }

  // Verify property belongs to this org
  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("id, ai_reformat_count, ai_reformat_bonus")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  logQueryError("POST properties", propertyError)

  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 })

  // Tier credit limit
  const limit = TIER_REFORMAT_LIMITS[tier ?? "steward"] ?? 3
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
  await db
    .from("properties")
    .update({ ai_reformat_count: used + 1 })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  // Audit log
  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "properties", recordId: propertyId,
    after: { action: "ai_reformat_rule", entity_type: "property", input_length: text.length },
  })

  const remaining = totalAllowed - (used + 1)

  return NextResponse.json({ formatted_text: formattedText, credits_remaining: remaining })
}
