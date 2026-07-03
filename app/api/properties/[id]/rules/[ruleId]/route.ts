/**
 * app/api/properties/[id]/rules/[ruleId]/route.ts — update/delete a single property house rule
 *
 * Route:  PUT/DELETE /api/properties/[id]/rules/[ruleId]
 * Auth:   gateway() (agent session + org membership)
 * Data:   property_rules, updated/deleted WHERE id = ruleId AND property_id AND org_id (all org-scoped).
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: house rules are config on
 *         an existing property ("your data, always").
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

// PUT /api/properties/[id]/rules/[ruleId]
// Body: { title?, body_text?, params?, sort_order? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id: propertyId, ruleId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await req.json() as {
    title?: string
    body_text?: string
    params?: Record<string, string>
    sort_order?: number
  }

  const { data, error } = await db
    .from("property_rules")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body_text !== undefined && { body_text: body.body_text }),
      ...(body.params !== undefined && { params: body.params }),
      ...(body.sort_order !== undefined && { sort_order: body.sort_order }),
    })
    .eq("id", ruleId)
    .eq("property_id", propertyId)
    .eq("org_id", orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ rule: data })
}

// DELETE /api/properties/[id]/rules/[ruleId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id: propertyId, ruleId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { error } = await db
    .from("property_rules")
    .delete()
    .eq("id", ruleId)
    .eq("property_id", propertyId)
    .eq("org_id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
