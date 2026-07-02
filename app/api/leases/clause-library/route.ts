/**
 * app/api/leases/clause-library/route.ts — clause library + org toggle/wording defaults for a lease type
 *
 * Route:  GET /api/leases/clause-library?type=residential
 * Auth:   gateway() (agent session + org membership)
 * Data:   lease_clause_library (shared seed data, no org_id) merged with org_lease_clause_defaults
 *         and org-level lease_clause_selections (lease_id IS NULL) — both org-scoped via gateway orgId.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const leaseType = req.nextUrl.searchParams.get("type") ?? "residential"

  // Clause library is shared seed data (no org_id) — filter only by lease type
  const { data: library, error: libraryError } = await db
    .from("lease_clause_library")
    .select("clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, depends_on, sort_order, description, toggle_label")
    .in("lease_type", [leaseType, "both"])
    .order("sort_order")
  logQueryError("GET lease_clause_library", libraryError)

  // Org toggle defaults
  const { data: orgDefaults, error: orgDefaultsError } = await db
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", orgId)
  logQueryError("GET org_lease_clause_defaults", orgDefaultsError)

  // Org-level custom wording (lease_id IS NULL)
  const { data: orgCustom, error: orgCustomError } = await db
    .from("lease_clause_selections")
    .select("clause_key, custom_body")
    .eq("org_id", orgId)
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
    orgId,
  })
}
