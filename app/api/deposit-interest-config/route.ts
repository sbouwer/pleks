import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { format } from "date-fns"

async function getOrgIdAndUser(): Promise<{ orgId: string; userId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = await createServiceClient()
  const { data } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!data) return null
  return { orgId: data.org_id, userId: user.id }
}

// GET /api/deposit-interest-config?propertyId=...&includeHistory=true
// Returns configs for a scope (org, property, or unit)
export async function GET(req: NextRequest) {
  const auth = await getOrgIdAndUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const propertyId = url.searchParams.get("propertyId") ?? null
  const unitId = url.searchParams.get("unitId") ?? null
  const includeHistory = url.searchParams.get("includeHistory") === "true"

  const service = await createServiceClient()
  let query = service
    .from("deposit_interest_config")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("effective_from", { ascending: false })

  if (unitId) {
    query = query.eq("unit_id", unitId)
  } else if (propertyId) {
    query = query.eq("property_id", propertyId).is("unit_id", null)
  } else {
    query = query.is("property_id", null).is("unit_id", null)
  }

  if (!includeHistory) {
    query = query.is("effective_to", null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

interface ConfigPayload {
  propertyId?: string | null
  unitId?: string | null
  rateType: "fixed" | "prime_linked" | "repo_linked" | "manual"
  fixedRatePercent?: number | null
  primeOffsetPercent?: number | null
  repoOffsetPercent?: number | null
  compounding: "daily" | "monthly"
  bankName?: string | null
  accountReference?: string | null
  effectiveFrom: string
  changeReason?: string | null
}

// POST /api/deposit-interest-config
// Creates a new config, ending the previous active one at effectiveFrom - 1 day
export async function POST(req: NextRequest) {
  const auth = await getOrgIdAndUser()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as ConfigPayload
  const { propertyId = null, unitId = null, rateType, effectiveFrom, changeReason } = body

  if (!rateType || !effectiveFrom) {
    return NextResponse.json({ error: "rateType and effectiveFrom required" }, { status: 400 })
  }

  const service = await createServiceClient()

  // Find current active config for this scope
  let existingQuery = service
    .from("deposit_interest_config")
    .select("id")
    .eq("org_id", auth.orgId)
    .is("effective_to", null)

  if (unitId) {
    existingQuery = existingQuery.eq("unit_id", unitId)
  } else {
    existingQuery = existingQuery.is("unit_id", null)
  }
  if (propertyId) {
    existingQuery = existingQuery.eq("property_id", propertyId)
  } else {
    existingQuery = existingQuery.is("property_id", null)
  }

  const { data: existing } = await existingQuery.single()

  // End the current active config the day before the new one starts
  if (existing) {
    const effectiveTo = format(
      new Date(new Date(effectiveFrom).getTime() - 86400000),
      "yyyy-MM-dd"
    )
    await service
      .from("deposit_interest_config")
      .update({ effective_to: effectiveTo })
      .eq("id", existing.id)

    // Audit: ended
    const { data: endedConfig } = await service
      .from("deposit_interest_config")
      .select("*")
      .eq("id", existing.id)
      .single()

    if (endedConfig) {
      await service.from("deposit_interest_config_audit").insert({
        org_id: auth.orgId,
        config_id: existing.id,
        action: "ended",
        rate_type: endedConfig.rate_type,
        fixed_rate_percent: endedConfig.fixed_rate_percent,
        prime_offset_percent: endedConfig.prime_offset_percent,
        repo_offset_percent: endedConfig.repo_offset_percent,
        compounding: endedConfig.compounding,
        bank_name: endedConfig.bank_name,
        account_reference: endedConfig.account_reference,
        effective_from: endedConfig.effective_from,
        effective_to: effectiveTo,
        changed_by: auth.userId,
        change_reason: changeReason ?? null,
      })
    }
  }

  // Insert new config
  const { data: newConfig, error } = await service
    .from("deposit_interest_config")
    .insert({
      org_id: auth.orgId,
      property_id: propertyId,
      unit_id: unitId,
      rate_type: rateType,
      fixed_rate_percent: body.fixedRatePercent ?? null,
      prime_offset_percent: body.primeOffsetPercent ?? null,
      repo_offset_percent: body.repoOffsetPercent ?? null,
      compounding: body.compounding ?? "monthly",
      bank_name: body.bankName ?? null,
      account_reference: body.accountReference ?? null,
      effective_from: effectiveFrom,
      effective_to: null,
      created_by: auth.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit: created
  await service.from("deposit_interest_config_audit").insert({
    org_id: auth.orgId,
    config_id: newConfig.id,
    action: "created",
    rate_type: newConfig.rate_type,
    fixed_rate_percent: newConfig.fixed_rate_percent,
    prime_offset_percent: newConfig.prime_offset_percent,
    repo_offset_percent: newConfig.repo_offset_percent,
    compounding: newConfig.compounding,
    bank_name: newConfig.bank_name,
    account_reference: newConfig.account_reference,
    effective_from: newConfig.effective_from,
    effective_to: null,
    changed_by: auth.userId,
    change_reason: changeReason ?? null,
  })

  return NextResponse.json({ ok: true, config: newConfig })
}
