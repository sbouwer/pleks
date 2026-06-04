/**
 * app/api/leases/clause-library/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("GET user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const leaseType = req.nextUrl.searchParams.get("type") ?? "residential"

  // Fetch clause library via service client (table has no public RLS policies)
  const service = await createServiceClient()
  const { data: library, error: libraryError } = await service
    .from("lease_clause_library")
    .select("clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, depends_on, sort_order, description, toggle_label")
    .in("lease_type", [leaseType, "both"])
    .order("sort_order")
    logQueryError("GET lease_clause_library", libraryError)

  // Fetch org toggle defaults
  const { data: orgDefaults, error: orgDefaultsError } = await supabase
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", membership.org_id)
    logQueryError("GET org_lease_clause_defaults", orgDefaultsError)

  // Fetch org-level custom wording (lease_id IS NULL)
  const { data: orgCustom, error: orgCustomError } = await supabase
    .from("lease_clause_selections")
    .select("clause_key, custom_body")
    .eq("org_id", membership.org_id)
    .is("lease_id", null)
    logQueryError("GET lease_clause_selections", orgCustomError)

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
