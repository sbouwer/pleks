import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
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

  const leaseType = req.nextUrl.searchParams.get("type") ?? "residential"

  // Fetch clause library (include body_template for editor)
  const { data: library } = await supabase
    .from("lease_clause_library")
    .select("clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, depends_on, sort_order, description, toggle_label")
    .in("lease_type", [leaseType, "both"])
    .order("sort_order")

  // Fetch org toggle defaults
  const { data: orgDefaults } = await supabase
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", membership.org_id)

  // Fetch org-level custom wording (lease_id IS NULL)
  const { data: orgCustom } = await supabase
    .from("lease_clause_selections")
    .select("clause_key, custom_body")
    .eq("org_id", membership.org_id)
    .is("lease_id", null)

  const orgMap = new Map(orgDefaults?.map((d) => [d.clause_key, d.enabled]) ?? [])
  const customMap = new Map(orgCustom?.map((c) => [c.clause_key, c.custom_body]) ?? [])

  const required = (library ?? []).filter((c) => c.is_required).map((c) => ({
    ...c,
    custom_body: customMap.get(c.clause_key) ?? null,
  }))

  const optional = (library ?? []).filter((c) => !c.is_required).map((c) => ({
    ...c,
    enabled: orgMap.get(c.clause_key) ?? c.is_enabled_by_default,
    custom_body: customMap.get(c.clause_key) ?? null,
  }))

  const defaultEnabled = required.length + optional.filter((c) => c.enabled).length

  return NextResponse.json({
    required,
    optional,
    total: (library ?? []).length,
    defaultEnabled,
    orgId: membership.org_id,
  })
}
