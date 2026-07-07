/**
 * app/(dashboard)/leases/new/page.tsx — opens the unified lease-creation modal (LeaseWizardModal)
 *
 * Route:  /leases/new
 * Auth:   requireAdminAuth via getServerOrgMembership (redirects to /login if missing)
 * Data:   pre-fills property/unit/tenant from query params; owner tier auto-prefills from single property
 * Notes:  ADDENDUM_LEASE_CREATION_MODAL Phase 1 — the page resolves prefill (incl. renewal) + disclaimer
 *         acceptance and opens LeaseWizardModal, returning to /leases on close (mirrors /properties/new).
 *         The disclaimer now gates the "Generate with Pleks" branch inside the modal only (D-10), not the
 *         whole flow.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"
import { contactDisplayName } from "@/lib/contacts/displayName"
import { NewLeaseRoute } from "./NewLeaseRoute"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { getPrimeRateOn } from "@/lib/deposits/interestConfig"

interface Props {
  searchParams: Promise<Record<string, string>>
}

type TenantRow = { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null

function displayName(row: TenantRow): string | null {
  if (!row) return null
  return contactDisplayName(row, "") || null
}

type SupabaseService = Awaited<ReturnType<typeof createServiceClient>>

interface OwnerPrefillResult {
  propertyId: string
  unitId: string
  tenantId: string | null
  resolvedTenantName: string | null
  resolvedCoTenants: { id: string; name: string }[]
}

type ProspectiveTenantResult = { tenantId: string; resolvedTenantName: string | null; resolvedCoTenants: { id: string; name: string }[] } | null

async function resolveProspectiveTenant(
  supabase: SupabaseService,
  prospectiveTenantId: string,
  prospCoIds: string[],
): Promise<ProspectiveTenantResult> {
  const fetchCoTenant = (id: string) =>
    supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
      .then((r) => ({ id, data: r.data as TenantRow }))

  const [primRes, ...coResArr] = await Promise.all([
    supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", prospectiveTenantId).single(),
    ...prospCoIds.map(fetchCoTenant),
  ])
  if (!primRes.data) return null
  return {
    tenantId: prospectiveTenantId,
    resolvedTenantName: displayName(primRes.data as TenantRow),
    resolvedCoTenants: coResArr.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id })),
  }
}

async function prefillOwnerTier(
  supabase: SupabaseService,
  orgId: string,
  existingTenantId: string | null,
): Promise<OwnerPrefillResult | null> {
  const { data: ownerProp, error: ownerPropError } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()
    logQueryError("prefillOwnerTier properties", ownerPropError)
  if (!ownerProp) return null

  const { data: ownerUnit, error: ownerUnitError } = await supabase
    .from("units")
    .select("id, prospective_tenant_id, prospective_co_tenant_ids")
    .eq("property_id", ownerProp.id)
    .is("deleted_at", null)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()
    logQueryError("prefillOwnerTier units", ownerUnitError)

  const u = ownerUnit as unknown as { id: string; prospective_tenant_id?: string | null; prospective_co_tenant_ids?: string[] } | null
  const noTenantResult: OwnerPrefillResult = { propertyId: ownerProp.id, unitId: u?.id ?? "", tenantId: null, resolvedTenantName: null, resolvedCoTenants: [] }

  if (!u) return noTenantResult
  if (existingTenantId || !u.prospective_tenant_id) return noTenantResult

  const resolved = await resolveProspectiveTenant(supabase, u.prospective_tenant_id, u.prospective_co_tenant_ids ?? [])
  if (!resolved) return noTenantResult
  return { propertyId: ownerProp.id, unitId: u.id, ...resolved }
}

function buildUnitLabel(unitData: { unit_number: string | null; bedrooms: number | null; bathrooms: number | null } | null): string | null {
  if (!unitData) return null
  return [
    unitData.unit_number ? `Unit ${unitData.unit_number}` : "Unit",
    unitData.bedrooms ? `${unitData.bedrooms} bed` : null,
    unitData.bathrooms ? `${unitData.bathrooms} bath` : null,
  ].filter(Boolean).join(" — ")
}

interface ResolvedIds {
  propertyId: string | null
  unitId: string | null
  tenantId: string | null
  resolvedTenantName: string | null
  resolvedCoTenants: { id: string; name: string }[]
}

/** Resolve the property/unit/tenant IDs to prefill, applying the owner-tier single-property auto-fill. */
async function resolveIds(
  supabase: SupabaseService,
  orgId: string,
  tier: string | null,
  sp: Record<string, string>,
): Promise<ResolvedIds> {
  const base: ResolvedIds = {
    propertyId: sp.property ?? null,
    unitId: sp.unit ?? null,
    tenantId: sp.tenant ?? null,
    resolvedTenantName: null,
    resolvedCoTenants: [],
  }
  if (base.propertyId || tier !== "owner") return base

  const prefill = await prefillOwnerTier(supabase, orgId, base.tenantId)
  if (!prefill) return base
  return {
    propertyId: prefill.propertyId,
    unitId: prefill.unitId || base.unitId,
    tenantId: prefill.tenantId ?? base.tenantId,
    resolvedTenantName: prefill.resolvedTenantName,
    resolvedCoTenants: prefill.resolvedCoTenants,
  }
}

export default async function NewLeasePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const accepted = await hasAcceptedLeaseDisclaimer()
  const { org_id: orgId } = membership
  const supabase = await createServiceClient()

  const sp = await searchParams
  const renewalOf = sp.renewal_of ?? null
  const coTenantIds = sp.co_tenants ? sp.co_tenants.split(",").filter(Boolean) : []

  const ids = await resolveIds(supabase, orgId, membership.tier, sp)
  const { propertyId, unitId, tenantId, resolvedTenantName, resolvedCoTenants } = ids

  // Fetch display names for the resolved IDs.
  const [propRes, unitRes, tenantRes, ...coTenantResults] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("name").eq("id", propertyId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase.from("units").select("unit_number, bedrooms, bathrooms, asking_rent_cents, default_lease_period_months").eq("id", unitId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    tenantId && !resolvedTenantName
      ? supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", tenantId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    ...coTenantIds.map((id) =>
      // org-scope guard (caller-ID): co_tenants ids come straight from the URL — never org-resolved upstream
      supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).eq("org_id", orgId).single()
        .then((res) => ({ id, data: res.data as TenantRow }))
    ),
  ])

  const unitData = unitRes.data as { unit_number: string | null; bedrooms: number | null; bathrooms: number | null; asking_rent_cents: number | null; default_lease_period_months: number | null } | null
  const finalCoTenants = resolvedCoTenants.length > 0
    ? resolvedCoTenants
    : coTenantResults.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id }))

  // Live SA prime (prime_rates) for the arrears-interest preview — derived, never hardcoded.
  const currentPrimePercent = await getPrimeRateOn(new Date().toISOString().slice(0, 10))

  // Selectable org accounts for the banking annexure (trust / deposit / ppra — NEVER business, per
  // D-TRUST-01 + ADDENDUM_69A). Account numbers masked to last 4 for the wizard; the full number only
  // appears on the server-generated lease. Pre-select a trust (rent) + deposit (deposit-holding) account.
  const { data: acctRows, error: acctErr } = await supabase
    .from("bank_accounts")
    .select("id, type, bank_name, account_holder, account_number, branch_code")
    .eq("org_id", orgId).neq("type", "business").order("created_at")
  logQueryError("NewLeasePage bank_accounts", acctErr)
  const availableAccounts = (acctRows ?? []).map((a) => ({
    id: a.id as string,
    type: a.type as string,
    bankName: (a.bank_name as string) ?? "",
    accountHolder: (a.account_holder as string) ?? "",
    accountNumberMasked: a.account_number && (a.account_number as string).length > 4
      ? `•••• ${(a.account_number as string).slice(-4)}`
      : ((a.account_number as string) ?? ""),
    branchCode: (a.branch_code as string) ?? "",
  }))
  const onlyOne = availableAccounts.length === 1 ? availableAccounts[0].id : ""
  const trustAccountId = (availableAccounts.find((a) => a.type === "trust" || a.type === "ppra_trust")?.id) ?? onlyOne
  const depositAccountId = (availableAccounts.find((a) => a.type === "deposit_holding" || a.type === "ppra_trust")?.id) ?? trustAccountId ?? onlyOne

  return (
    <NewLeaseRoute
      prefill={{
        propertyId,
        propertyName: propRes.data?.name ?? null,
        unitId,
        unitLabel: buildUnitLabel(unitData),
        askingRentCents: unitData?.asking_rent_cents ?? null,
        defaultLeasePeriodMonths: unitData?.default_lease_period_months ?? null,
        currentPrimePercent,
        availableAccounts,
        trustAccountId,
        depositAccountId,
        tenantId,
        tenantName: resolvedTenantName ?? displayName(tenantRes.data as TenantRow),
        coTenants: finalCoTenants,
      }}
      renewalOf={renewalOf}
      disclaimerAccepted={accepted}
    />
  )
}
