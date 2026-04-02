import type { SupabaseClient } from "@supabase/supabase-js"

export interface ResolvedClause {
  clause_key: string
  title: string
  toggle_label: string | null
  enabled: boolean
  source: "required" | "unit_override" | "org_default" | "library_default"
  is_required: boolean
}

/**
 * Resolves the effective clause state for a unit by applying the
 * three-level inheritance chain:
 *   lease_clause_library → org_lease_clause_defaults → unit_clause_defaults
 *
 * Required clauses are always enabled and cannot be overridden.
 * Returns all clauses ordered by sort_order.
 */
export async function resolveClausesForUnit(
  supabase: SupabaseClient,
  orgId: string,
  unitId: string,
  leaseType: string
): Promise<ResolvedClause[]> {
  const [libraryResult, orgResult, unitResult] = await Promise.all([
    supabase
      .from("lease_clause_library")
      .select("clause_key, title, toggle_label, is_required, is_enabled_by_default, lease_type")
      .or(`lease_type.eq.both,lease_type.eq.${leaseType}`)
      .order("sort_order"),
    supabase
      .from("org_lease_clause_defaults")
      .select("clause_key, enabled")
      .eq("org_id", orgId),
    supabase
      .from("unit_clause_defaults")
      .select("clause_key, enabled")
      .eq("unit_id", unitId),
  ])

  const orgMap = new Map((orgResult.data ?? []).map((d) => [d.clause_key, d.enabled]))
  const unitMap = new Map((unitResult.data ?? []).map((d) => [d.clause_key, d.enabled]))

  return (libraryResult.data ?? []).map((clause) => {
    const base = { clause_key: clause.clause_key, title: clause.title, toggle_label: clause.toggle_label ?? null }

    if (clause.is_required) {
      return { ...base, enabled: true, source: "required" as const, is_required: true }
    }

    if (unitMap.has(clause.clause_key)) {
      return { ...base, enabled: unitMap.get(clause.clause_key)!, source: "unit_override" as const, is_required: false }
    }

    if (orgMap.has(clause.clause_key)) {
      return { ...base, enabled: orgMap.get(clause.clause_key)!, source: "org_default" as const, is_required: false }
    }

    return { ...base, enabled: clause.is_enabled_by_default, source: "library_default" as const, is_required: false }
  })
}
