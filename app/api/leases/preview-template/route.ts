import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"

function resolveTokens(body: string, clauseNumberMap: Map<string, number>): string {
  // {{ref:key}} → <span class="token-ref">clause N</span>
  let resolved = body.replaceAll(/\{\{ref:([^}]+)\}\}/g, (_match, key: string) => {
    const num = clauseNumberMap.get(key)
    return `<span class="token-ref">clause ${num ?? "?"}</span>`
  })

  // {{self:N}} → <span class="token-self">[N]</span>
  resolved = resolved.replaceAll(/\{\{self:([^}]+)\}\}/g, (_match, n: string) => {
    return `<span class="token-self">[${n}]</span>`
  })

  // {{var:field}} → <span class="token-var">[field name]</span>
  resolved = resolved.replaceAll(/\{\{var:([^}]+)\}\}/g, (_match, field: string) => {
    const label = field.replaceAll("_", " ")
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

  // Fetch clause library, org branding, and banking in parallel
  const service = await createServiceClient()

  const [libraryRes, orgRes, banking] = await Promise.all([
    service
      .from("lease_clause_library")
      .select("clause_key, title, body_template, is_required, is_enabled_by_default, sort_order")
      .in("lease_type", [leaseType, "both"])
      .order("sort_order"),
    supabase
      .from("organisations")
      .select("name, lease_logo_path, lease_display_name, lease_registration_number, lease_address, lease_phone, lease_email, lease_website, lease_accent_color")
      .eq("id", membership.org_id)
      .single(),
    getLessorBankDetails(membership.org_id),
  ])

  if (libraryRes.error) {
    return NextResponse.json({ error: libraryRes.error.message }, { status: 500 })
  }

  // Fetch org-level toggle defaults
  const { data: orgDefaults } = await supabase
    .from("org_lease_clause_defaults")
    .select("clause_key, enabled")
    .eq("org_id", membership.org_id)

  const orgMap = new Map(orgDefaults?.map((d) => [d.clause_key, d.enabled]) ?? [])

  // Filter to enabled clauses
  const enabledClauses = (libraryRes.data ?? []).filter((clause) => {
    if (clause.is_required) return true
    return orgMap.get(clause.clause_key) ?? clause.is_enabled_by_default
  })

  // Assign sequential numbers
  const clauseNumberMap = new Map<string, number>()
  enabledClauses.forEach((clause, index) => {
    clauseNumberMap.set(clause.clause_key, index + 1)
  })

  const clauses = enabledClauses.map((clause, index) => ({
    number: index + 1,
    key: clause.clause_key,
    title: clause.title,
    body: resolveTokens(clause.body_template ?? "", clauseNumberMap),
    is_required: clause.is_required,
  }))

  // Build branding response (cast for new migration columns)
  const org = orgRes.data as unknown as {
    name: string | null
    lease_logo_path: string | null
    lease_display_name: string | null
    lease_registration_number: string | null
    lease_address: string | null
    lease_phone: string | null
    lease_email: string | null
    lease_website: string | null
    lease_accent_color: string | null
  } | null

  let logoUrl: string | null = null
  if (org?.lease_logo_path) {
    const { data: signed } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(org.lease_logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  const branding = {
    displayName: org?.lease_display_name ?? org?.name ?? null,
    registration: org?.lease_registration_number ?? null,
    address: org?.lease_address ?? null,
    phone: org?.lease_phone ?? null,
    email: org?.lease_email ?? null,
    website: org?.lease_website ?? null,
    accentColor: org?.lease_accent_color ?? null,
    logoUrl,
  }

  return NextResponse.json({
    clauses,
    leaseType,
    totalClauses: clauses.length,
    branding,
    banking: {
      accountHolder: banking.accountHolder,
      bankName: banking.bankName,
      accountNumber: banking.accountNumber,
      branchCode: banking.branchCode,
      configured: banking.configured,
    },
  })
}
