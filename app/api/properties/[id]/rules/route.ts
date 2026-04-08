import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/properties/[id]/rules
// Returns: { rules, templates, credits: { used, total, remaining } }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const [rulesRes, templatesRes, propertyRes, subRes] = await Promise.all([
    supabase
      .from("property_rules")
      .select("*")
      .eq("property_id", propertyId)
      .eq("org_id", membership.org_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("rule_templates")
      .select("*")
      .order("sort_order", { ascending: true }),

    supabase
      .from("properties")
      .select("id, ai_reformat_count, ai_reformat_bonus")
      .eq("id", propertyId)
      .eq("org_id", membership.org_id)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("subscriptions")
      .select("tier")
      .eq("org_id", membership.org_id)
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

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

  const { data, error } = await supabase
    .from("property_rules")
    .insert({
      property_id: propertyId,
      org_id: membership.org_id,
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
