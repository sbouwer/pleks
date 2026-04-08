import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PUT /api/properties/[id]/rules/[ruleId]
// Body: { title?, body_text?, params?, sort_order? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id: propertyId, ruleId } = await params
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
    title?: string
    body_text?: string
    params?: Record<string, string>
    sort_order?: number
  }

  const { data, error } = await supabase
    .from("property_rules")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body_text !== undefined && { body_text: body.body_text }),
      ...(body.params !== undefined && { params: body.params }),
      ...(body.sort_order !== undefined && { sort_order: body.sort_order }),
    })
    .eq("id", ruleId)
    .eq("property_id", propertyId)
    .eq("org_id", membership.org_id)
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

  const { error } = await supabase
    .from("property_rules")
    .delete()
    .eq("id", ruleId)
    .eq("property_id", propertyId)
    .eq("org_id", membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
