/**
 * app/api/hoa/route.ts — create a new HOA / body-corporate entity (Firm tier)
 *
 * Route:  POST /api/hoa
 * Auth:   requireAgentWriteAccess("create_hoa") — creating an HOA is net-new billable business, so it is
 *         subscription-lockdown gated; additionally requires Firm tier.
 * Data:   verifies the parent property belongs to the org, then inserts hoa_entities (org-scoped).
 * Notes:  Lockdown surfaces as a clean 403 ({ code: "subscription_locked" }), never a 500.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"

// POST /api/hoa — create a new HOA entity
export async function POST(req: NextRequest) {
  let gw
  try {
    gw = await requireAgentWriteAccess("create_hoa")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, orgId, tier } = gw

  // Firm tier only
  if (tier !== "firm") {
    return NextResponse.json({ error: "HOA management requires Firm tier" }, { status: 403 })
  }

  const body = await req.json() as {
    name: string
    entity_type: string
    property_id: string
    registration_number?: string
    csos_registration_number?: string
    financial_year_end_month?: number
    managing_agent_name?: string
    trustees_count?: number
    registered_address?: string
  }

  if (!body.name?.trim() || !body.entity_type || !body.property_id) {
    return NextResponse.json({ error: "name, entity_type and property_id are required" }, { status: 400 })
  }

  // Verify property belongs to this org
  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("id")
    .eq("id", body.property_id)
    .eq("org_id", orgId)
    .single()
  if (propertyError) console.error("POST /api/hoa properties read failed:", propertyError.message)

  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 })

  const { data: hoa, error } = await db
    .from("hoa_entities")
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      entity_type: body.entity_type,
      property_id: body.property_id,
      registration_number: body.registration_number?.trim() || null,
      csos_registration_number: body.csos_registration_number?.trim() || null,
      financial_year_end_month: body.financial_year_end_month ?? 2,
      managing_agent_name: body.managing_agent_name?.trim() || null,
      trustees_count: body.trustees_count ?? 3,
      registered_address: body.registered_address?.trim() || null,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: hoa.id }, { status: 201 })
}
