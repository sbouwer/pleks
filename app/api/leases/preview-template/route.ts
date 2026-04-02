import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function resolveTokens(body: string, clauseNumberMap: Map<string, number>): string {
  // {{ref:key}} → <span class="token-ref">clause N</span>
  let resolved = body.replace(/\{\{ref:([^}]+)\}\}/g, (_match, key: string) => {
    const num = clauseNumberMap.get(key)
    return `<span class="token-ref">clause ${num ?? "?"}</span>`
  })

  // {{self:N}} → <span class="token-self">[N]</span>
  resolved = resolved.replace(/\{\{self:([^}]+)\}\}/g, (_match, n: string) => {
    return `<span class="token-self">[${n}]</span>`
  })

  // {{var:field}} → <span class="token-var">[field name]</span>
  resolved = resolved.replace(/\{\{var:([^}]+)\}\}/g, (_match, field: string) => {
    const label = field.replace(/_/g, " ")
    return `<span class="token-var">[${label}]</span>`
  })

  return resolved
}

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

  const leaseType = req.nextUrl.searchParams.get("leaseType") ?? "residential"

  // Fetch clause library via service client (no public RLS policies)
  const service = await createServiceClient()
  const { data: library, error: libraryError } = await service
    .from("lease_clause_library")
    .select("clause_key, title, body_template, is_required, is_enabled_by_default, sort_order")
    .in("lease_type", [leaseType, "both"])
    .order("sort_order")

  if (libraryError) {
    return NextResponse.json({ error: libraryError.message }, { status: 500 })
  }

  // Fetch org-level toggle defaults via user client
  const { data: orgDefaults } = await supabase
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", membership.org_id)

  const orgMap = new Map(orgDefaults?.map((d) => [d.clause_key, d.enabled]) ?? [])

  // Merge org defaults and filter to enabled clauses (required always included)
  const enabledClauses = (library ?? []).filter((clause) => {
    if (clause.is_required) return true
    return orgMap.get(clause.clause_key) ?? clause.is_enabled_by_default
  })

  // Assign sequential numbers in sort_order
  const clauseNumberMap = new Map<string, number>()
  enabledClauses.forEach((clause, index) => {
    clauseNumberMap.set(clause.clause_key, index + 1)
  })

  // Build response clauses with resolved tokens
  const clauses = enabledClauses.map((clause, index) => ({
    number: index + 1,
    key: clause.clause_key,
    title: clause.title,
    body: resolveTokens(clause.body_template ?? "", clauseNumberMap),
    is_required: clause.is_required,
  }))

  return NextResponse.json({
    clauses,
    leaseType,
    totalClauses: clauses.length,
  })
}
