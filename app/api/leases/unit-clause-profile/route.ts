import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// GET /api/leases/unit-clause-profile?unitId=xxx&leaseType=residential
// Returns resolved optional clauses for a unit with unit-specific state.
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

  const unitId = req.nextUrl.searchParams.get("unitId")
  const leaseType = req.nextUrl.searchParams.get("leaseType") ?? "residential"

  if (!unitId) return NextResponse.json({ error: "unitId required" }, { status: 400 })

  const orgId = membership.org_id
  const service = await createServiceClient()

  const [libraryResult, orgResult, unitResult] = await Promise.all([
    service
      .from("lease_clause_library")
      .select("clause_key, title, toggle_label, is_required, is_enabled_by_default")
      .or(`lease_type.eq.both,lease_type.eq.${leaseType}`)
      .eq("is_required", false)
      .order("sort_order"),
    supabase
      .from("org_lease_clause_defaults")
      .select("clause_key, enabled")
      .eq("org_id", orgId),
    supabase
      .from("unit_clause_defaults")
      .select("clause_key, enabled, auto_set")
      .eq("unit_id", unitId),
  ])

  const orgMap = new Map((orgResult.data ?? []).map((d) => [d.clause_key, d.enabled]))
  const unitMap = new Map((unitResult.data ?? []).map((d) => [d.clause_key, { enabled: d.enabled, auto_set: d.auto_set }]))

  const clauses = (libraryResult.data ?? []).map((clause) => {
    const unitEntry = unitMap.get(clause.clause_key)
    const orgEnabled = orgMap.has(clause.clause_key)
      ? orgMap.get(clause.clause_key)!
      : clause.is_enabled_by_default

    const base = { clause_key: clause.clause_key, title: clause.title, toggle_label: clause.toggle_label ?? null }

    if (unitEntry !== undefined) {
      return {
        ...base,
        enabled: unitEntry.enabled,
        source: "unit_override" as const,
        auto_set: unitEntry.auto_set,
        unit_enabled: unitEntry.enabled,
        org_enabled: orgEnabled,
      }
    }

    return {
      ...base,
      enabled: orgEnabled,
      source: orgMap.has(clause.clause_key) ? ("org_default" as const) : ("library_default" as const),
      auto_set: null,
      unit_enabled: null,
      org_enabled: orgEnabled,
    }
  })

  return NextResponse.json({ clauses })
}

interface UpdateEntry {
  clause_key: string
  state: "inherit" | "on" | "off"
}

// PATCH /api/leases/unit-clause-profile
// Body: { unitId: string, updates: UpdateEntry[] }
export async function PATCH(req: NextRequest) {
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

  const body = await req.json() as { unitId: string; updates: UpdateEntry[] }
  const { unitId, updates } = body

  if (!unitId || !Array.isArray(updates)) {
    return NextResponse.json({ error: "unitId and updates required" }, { status: 400 })
  }

  const orgId = membership.org_id

  const toDelete: string[] = []
  const toUpsert: Array<{
    unit_id: string
    org_id: string
    clause_key: string
    enabled: boolean
    auto_set: boolean
  }> = []

  for (const update of updates) {
    if (update.state === "inherit") {
      toDelete.push(update.clause_key)
    } else {
      toUpsert.push({
        unit_id: unitId,
        org_id: orgId,
        clause_key: update.clause_key,
        enabled: update.state === "on",
        auto_set: false,
      })
    }
  }

  if (toDelete.length > 0) {
    await supabase
      .from("unit_clause_defaults")
      .delete()
      .eq("unit_id", unitId)
      .in("clause_key", toDelete)
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("unit_clause_defaults")
      .upsert(toUpsert, { onConflict: "unit_id,clause_key" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
