/**
 * app/api/properties/[id]/rules/route.ts — list/create a property's house rules (+ AI-reformat credits)
 *
 * Route:  GET/POST /api/properties/[id]/rules
 * Auth:   gateway() (agent session + org membership)
 * Data:   property_rules (org-scoped), rule_templates (shared seed, no org_id), properties + subscriptions
 *         for the AI-reformat credit computation — all org-scoped via gateway orgId.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: house rules are config on
 *         an existing property ("your data, always"). rule_templates is shared seed (no org_id).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

// GET /api/properties/[id]/rules
// Returns: { rules, templates, credits: { used, total, remaining } }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const [rulesRes, templatesRes, propertyRes, subRes] = await Promise.all([
    db
      .from("property_rules")
      .select("*")
      .eq("property_id", propertyId)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    db
      .from("rule_templates")
      .select("*")
      .order("sort_order", { ascending: true }),

    db
      .from("properties")
      .select("id, ai_reformat_count, ai_reformat_bonus")
      .eq("id", propertyId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .single(),

    db
      .from("subscriptions")
      .select("tier")
      .eq("org_id", orgId)
      .single(),
  ])

  if (!propertyRes.data) return NextResponse.json({ error: "Property not found" }, { status: 404 })

  // Compute credits
  const { TIER_REFORMAT_LIMITS } = await import("@/lib/rules/templates")
  const tier = (subRes.data?.tier as string | null) ?? "steward"
  const limit = TIER_REFORMAT_LIMITS[tier] ?? 3
  const used = propertyRes.data.ai_reformat_count ?? 0
  const bonus = propertyRes.data.ai_reformat_bonus ?? 0
  const total = limit + bonus
  const remaining = Math.max(0, total - used)

  return NextResponse.json({
    rules: rulesRes.data ?? [],
    templates: templatesRes.data ?? [],
    credits: { used, total, remaining, tier_limit: limit },
  })
}

// POST /api/properties/[id]/rules
// Body: { rule_template_id?, title, body_text, params?, is_custom?, sort_order? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await req.json() as {
    rule_template_id?: string
    title: string
    body_text: string
    params?: Record<string, string>
    is_custom?: boolean
    sort_order?: number
  }

  if (!body.title || !body.body_text) {
    return NextResponse.json({ error: "title and body_text are required" }, { status: 400 })
  }

  const { data, error } = await db
    .from("property_rules")
    .insert({
      property_id: propertyId,
      org_id: orgId,
      rule_template_id: body.rule_template_id ?? null,
      title: body.title,
      body_text: body.body_text,
      params: body.params ?? {},
      is_custom: body.is_custom ?? false,
      sort_order: body.sort_order ?? 100,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rule: data })
}
