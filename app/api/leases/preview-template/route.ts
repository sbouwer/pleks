import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
import { parseClauseBody, buildSelfLookup } from "@/lib/leases/parseClauseBody"
import { renderClauseBodyToHtml } from "@/lib/leases/renderClauseHtml"

/** Resolves {{ref:key}} and {{var:field}} tokens only. {{self:N}} is deferred to post-parse. */
function resolveRefAndVar(body: string, clauseNumberMap: Map<string, number>): string {
  // {{ref:key}} → <span class="token-ref">clause N</span>
  let resolved = body.replaceAll(/\{\{ref:([^}]+)\}\}/g, (_match, key: string) => {
    const num = clauseNumberMap.get(key)
    return `<span class="token-ref">clause ${num ?? "?"}</span>`
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
      .select("name, trading_as, reg_number, eaab_number, phone, mobile, email, website, addr_line1, addr_suburb, addr_city, brand_logo_path, brand_accent_color, brand_cover_template")
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

  const clauses = enabledClauses.map((clause, index) => {
    const clauseNum = index + 1

    // Resolve ref + var tokens first (don't depend on sub-clause numbers)
    const preResolved = resolveRefAndVar(clause.body_template ?? "", clauseNumberMap)

    // Parse body to assign hierarchical sub-clause numbers
    const bodyNodes = parseClauseBody(preResolved, clauseNum)
    const selfLookup = buildSelfLookup(bodyNodes)

    // Resolve {{self:N}} using actual assigned numbers
    for (const node of bodyNodes) {
      node.text = node.text.replaceAll(/\{\{self:([^}]+)\}\}/g, (_match, n: string) => {
        const resolved = selfLookup[n]
        return resolved
          ? `<span class="token-self">${resolved}</span>`
          : `<span class="token-self">[${n}]</span>`
      })
    }

    return {
      number: clauseNum,
      key: clause.clause_key,
      title: clause.title,
      body: renderClauseBodyToHtml(bodyNodes),
      is_required: clause.is_required,
    }
  })

  // Build branding response
  const org = orgRes.data as unknown as {
    name: string | null
    trading_as: string | null
    reg_number: string | null
    eaab_number: string | null
    phone: string | null
    mobile: string | null
    email: string | null
    website: string | null
    addr_line1: string | null
    addr_suburb: string | null
    addr_city: string | null
    brand_logo_path: string | null
    brand_accent_color: string | null
    brand_cover_template: string | null
  } | null

  let logoUrl: string | null = null
  if (org?.brand_logo_path) {
    const { data: signed } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(org.brand_logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  const addrParts = [org?.addr_line1, org?.addr_suburb, org?.addr_city].filter(Boolean)

  const branding = {
    displayName: org?.trading_as ?? org?.name ?? null,
    tradingAs: org?.trading_as ?? null,
    registration: org?.reg_number ?? null,
    address: addrParts.join(", ") || null,
    phone: org?.phone ?? org?.mobile ?? null,
    email: org?.email ?? null,
    website: org?.website ?? null,
    accentColor: org?.brand_accent_color ?? null,
    coverTemplate: org?.brand_cover_template ?? "classic",
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
