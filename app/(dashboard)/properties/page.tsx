/**
 * app/(dashboard)/properties/page.tsx — Properties list/dashboard page
 *
 * Route:  /properties
 * Auth:   gatewaySSR (service-role client + explicit org_id filter — Pattern A)
 * Data:   properties, units, leases via service client with .eq("org_id", orgId)
 */
import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { TIER_ORDER } from "@/lib/constants"
import { contactDisplayName } from "@/lib/contacts/displayName"
import { SinglePropertyView, NoPropertyYet } from "@/components/properties/SinglePropertyView"
import { PropertyListView } from "@/components/properties/PropertyListView"
import type { SinglePropertyData } from "@/components/properties/SinglePropertyView"
import type { PropertyListItem } from "@/components/properties/PropertyList"
import { saTodayISO } from "@/lib/dates"

type GatewayDB = NonNullable<Awaited<ReturnType<typeof gatewaySSR>>>["db"]

/** Org-wide arrears: % of due rent currently unpaid (drives the Arrears KPI card). */
async function fetchArrearsPct(db: GatewayDB, orgId: string): Promise<number> {
  const today = saTodayISO()
  const { data, error } = await db
    .from("rent_invoices")
    .select("total_amount_cents, amount_paid_cents")
    .eq("org_id", orgId)
    .lte("due_date", today)
  if (error) console.error("[properties] arrears fetch failed:", error.message)
  let due = 0
  let unpaid = 0
  for (const inv of data ?? []) {
    due += inv.total_amount_cents
    unpaid += Math.max(0, inv.total_amount_cents - (inv.amount_paid_cents ?? 0))
  }
  return due > 0 ? Math.round((unpaid / due) * 100) : 0
}

function filterProperties(properties: PropertyListItem[], q: string, statusFilter: string): PropertyListItem[] {
  let out = properties
  if (q) {
    out = out.filter((p) =>
      p.name.toLowerCase().includes(q) || p.address_line1.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
  }
  if (statusFilter === "vacancies") {
    out = out.filter((p) => p.units.some((u) => !u.deleted_at && u.status !== "occupied"))
  } else if (statusFilter === "occupied") {
    out = out.filter((p) => {
      const active = p.units.filter((u) => !u.deleted_at)
      return active.length > 0 && active.every((u) => u.status === "occupied")
    })
  }
  return out
}

/** Attach landlord (owner) display names for the list's Landlord column. */
async function attachLandlordNames(db: GatewayDB, orgId: string, properties: PropertyListItem[]): Promise<PropertyListItem[]> {
  const ids = [...new Set(
    properties.map((p) => (p as unknown as { landlord_id?: string | null }).landlord_id).filter(Boolean),
  )] as string[]
  if (ids.length === 0) return properties
  const { data, error } = await db
    .from("landlords")
    .select("id, contact:contacts(first_name, last_name, company_name)")
    .in("id", ids)
    .eq("org_id", orgId)
  if (error) console.error("[properties] landlord names fetch failed:", error.message)
  const nameById = new Map<string, string>()
  for (const ll of data ?? []) {
    const c = (Array.isArray(ll.contact) ? ll.contact[0] : ll.contact) as { first_name: string | null; last_name: string | null; company_name: string | null } | null
    const name = c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim()
    if (name) nameById.set(ll.id, name)
  }
  return properties.map((p) => ({
    ...p,
    landlordName: nameById.get((p as unknown as { landlord_id?: string | null }).landlord_id ?? "") ?? null,
  }))
}

/** Per-property rent collection rate (% of due rent paid) for the list's Collection column. */
async function attachCollection(db: GatewayDB, orgId: string, properties: PropertyListItem[]): Promise<PropertyListItem[]> {
  const unitToProp = new Map<string, string>()
  for (const p of properties) {
    for (const u of p.units) unitToProp.set(u.id, p.id)
  }
  if (unitToProp.size === 0) return properties
  const today = saTodayISO()
  const { data, error } = await db
    .from("rent_invoices")
    .select("unit_id, total_amount_cents, amount_paid_cents")
    .eq("org_id", orgId)
    .lte("due_date", today)
  if (error) console.error("[properties] collection fetch failed:", error.message)
  const agg = new Map<string, { due: number; paid: number }>()
  for (const inv of data ?? []) {
    const propId = unitToProp.get(inv.unit_id as string)
    if (!propId) continue
    const a = agg.get(propId) ?? { due: 0, paid: 0 }
    a.due += inv.total_amount_cents
    a.paid += Math.min(inv.amount_paid_cents ?? 0, inv.total_amount_cents)
    agg.set(propId, a)
  }
  return properties.map((p) => {
    const a = agg.get(p.id)
    return { ...p, collectionPct: a && a.due > 0 ? Math.round((a.paid / a.due) * 100) : null }
  })
}

/** Owner tier single-property dashboard — the org's one property + its current invoice / prospective tenants. */
async function renderOwnerSingleProperty(db: GatewayDB, orgId: string): Promise<ReactNode> {
  const { data: rawProperty, error: ownerErr } = await db
    .from("properties")
    .select(`
      id, name, type, address_line1, address_line2, suburb, city, province, postal_code,
      managing_agent_id, is_sectional_title, levy_amount_cents, levy_account_number, managing_scheme_id,
      units(
        id, unit_number, status, deleted_at,
        bedrooms, bathrooms, size_m2, floor, parking_bays, furnished,
        asking_rent_cents, deposit_amount_cents, features, assigned_agent_id,
        prospective_tenant_id, prospective_co_tenant_ids,
        leases(
          id, status, rent_amount_cents, deposit_amount_cents,
          start_date, end_date, escalation_percent, escalation_review_date,
          tenant:tenants!tenant_id(
            id,
            contact:contacts(first_name, last_name, primary_phone, primary_email)
          )
        )
      )
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle()

  if (ownerErr) console.error("[properties] owner property fetch failed:", ownerErr.message)
  if (!rawProperty) return <NoPropertyYet />

  // Managing scheme resolved separately (its own fetch, not a PostgREST embed) so a missing/uncached
  // relationship can never 400 the whole select and blank the page. managing_scheme_id → managing_schemes
  // (the CANONICAL target — ADDENDUM_18B); the old contractors fetch here read the wrong table and always
  // returned null (BUG-A).
  const schemeId = (rawProperty as { managing_scheme_id?: string | null }).managing_scheme_id ?? null
  let managingScheme: { id: string; name: string | null } | null = null
  if (schemeId) {
    const { data: scheme, error: schemeErr } = await db
      .from("managing_schemes").select("id, name")
      .eq("id", schemeId).eq("org_id", orgId).maybeSingle()
    if (schemeErr) console.error("[properties] managing scheme fetch failed:", schemeErr.message)
    managingScheme = (scheme as typeof managingScheme) ?? null
  }

  const activeUnit = (rawProperty.units ?? [])[0]
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  type UnitExtra = { prospective_tenant_id?: string | null; prospective_co_tenant_ids?: string[] }
  const unitExtra = activeUnit as unknown as UnitExtra
  const prospTenantId = unitExtra?.prospective_tenant_id ?? null
  const prospCoTenantIds = unitExtra?.prospective_co_tenant_ids ?? []

  function tenantDisplayName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null) {
    if (!row) return null
    return contactDisplayName(row, "") || null
  }

  const [invoiceRes, prospTenantRes, ...coTenantResults] = await Promise.all([
    activeUnit
      ? db.from("rent_invoices").select("total_amount_cents, amount_paid_cents, due_date").eq("unit_id", activeUnit.id).gte("period_from", monthStart).maybeSingle()
      : Promise.resolve({ data: null }),
    prospTenantId
      ? db.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", prospTenantId).single()
      : Promise.resolve({ data: null }),
    ...prospCoTenantIds.map((id) =>
      db.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
        .then((res) => ({ id, data: res.data }))
    ),
  ])

  const prospCoTenants = (coTenantResults as { id: string; data: Parameters<typeof tenantDisplayName>[0] }[])
    .map((r) => ({ id: r.id, name: tenantDisplayName(r.data) ?? r.id }))

  const property = { ...(rawProperty as object), managing_scheme: managingScheme } as unknown as SinglePropertyData

  return (
    <SinglePropertyView
      property={property}
      currentInvoice={invoiceRes.data ?? null}
      orgId={orgId}
      prospectiveTenantId={prospTenantId}
      prospectiveTenantName={tenantDisplayName(prospTenantRes.data)}
      prospectiveCoTenants={prospCoTenants}
    />
  )
}

export default async function PropertiesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string>>
}>) {
  const sp = await searchParams
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { db, orgId, userId } = gw
  const tier = await getOrgTier(orgId)

  // ── Owner tier: single property dashboard ──────────────────────────────────
  // Owner tier is normally one property. After a downgrade an org can hold more than its tier allows, and
  // those reads must still work (your-data-always) — so use the single-property dashboard only when there's
  // exactly one; otherwise fall through to the standard list below, which shows them all.
  if (tier === "owner") {
    const { count: ownerPropCount, error: ownerCountErr } = await db
      .from("properties").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).is("deleted_at", null)
    if (ownerCountErr) console.error("[properties] owner property count failed:", ownerCountErr.message)
    if (!ownerPropCount) return <NoPropertyYet />
    if (ownerPropCount === 1) return await renderOwnerSingleProperty(db, orgId)
  }

  const arrearsPct = await fetchArrearsPct(db, orgId)

  // ── Steward and up: one filterable list view (owner's single-property view handled above) ──────────
  const q = sp.q?.toLowerCase() ?? ""
  const statusFilter = sp.status ?? ""
  const view = (sp.view ?? "list") as "list" | "cards"
  const archived = sp.archived === "1"
  // My portfolio / All scoping only applies from Portfolio up; below that everything is "all".
  let scope: "mine" | "all" = "all"
  if (TIER_ORDER[tier] >= TIER_ORDER.portfolio) scope = sp.scope === "all" ? "all" : "mine"

  let listQuery = db
    .from("properties")
    .select(`
      id, name, type, address_line1, city, province, landlord_id, managing_agent_id,
      units(id, status, deleted_at, asking_rent_cents, leases(id, status, rent_amount_cents))
    `)
    .eq("org_id", orgId)
  listQuery = archived ? listQuery.not("deleted_at", "is", null) : listQuery.is("deleted_at", null)
  const { data: rawProperties, error: listErr } = await listQuery.order("created_at", { ascending: false })

  if (listErr) console.error("[properties] list fetch failed:", listErr.message)
  let allProps = (rawProperties ?? []) as unknown as PropertyListItem[]
  const orgHasProperties = allProps.length > 0
  // My portfolio / All (ADDENDUM_TEAMS Layer 0) — properties I manage; not applicable to the archived view.
  if (scope === "mine" && !archived) {
    allProps = allProps.filter((p) => (p as { managing_agent_id?: string | null }).managing_agent_id === userId)
  }
  let properties = filterProperties(allProps, q, archived ? "" : statusFilter)
  properties = await attachLandlordNames(db, orgId, properties)
  if (!archived) properties = await attachCollection(db, orgId, properties)

  return (
    <PropertyListView
      properties={properties}
      tier={tier}
      view={view}
      arrearsPct={arrearsPct}
      archived={archived}
      scope={scope}
      orgHasProperties={orgHasProperties}
    />
  )
}
