import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { BackLink } from "@/components/ui/BackLink"
import { PropertyTabs } from "./PropertyTabs"
import { OverviewTab, type RecentActivityItem, type OverviewUnit } from "./OverviewTab"
import { UnitsTab, type UnitTabData, type BuildingTabData } from "./UnitsTab"
import { PropertyDocumentsTab } from "./PropertyDocumentsTab"
import { OperationsTab, type RecentInspection, type RecentMaintenance, type ComplianceItem, type AuditItem } from "./OperationsTab"
import { AgentPicker } from "./AgentPicker"
import { LandlordPicker } from "./LandlordPicker"
import { MobilePropertyView } from "@/components/mobile/MobilePropertyView"
import { formatZAR } from "@/lib/constants"
import { subtractBusinessDays } from "@/lib/dates/saPublicHolidays"

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(row: { first_name?: string | null; last_name?: string | null; company_name?: string | null }): string {
  return row.company_name?.trim() || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown"
}


const VALID_TABS = ["overview", "units", "documents", "operations"] as const
type TabId = (typeof VALID_TABS)[number]

// ── Tab-specific fetchers ─────────────────────────────────────────────────────

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>
type CookieClient  = Awaited<ReturnType<typeof createClient>>

interface UnitsData {
  activeUnits: UnitTabData[]
  archivedUnits: UnitTabData[]
  buildings: BuildingTabData[]
  tenantByUnit: Record<string, { name: string }>
  maintenanceByUnit: Record<string, number>
  agentMap: Record<string, { id: string; name: string; initials: string; role: string }>
  teamMembers: { userId: string; name: string; role: string }[]
}

async function fetchUnitsTabData(
  supabase: CookieClient,
  service: ServiceClient,
  propertyId: string,
  orgId: string,
): Promise<UnitsData> {
  const [
    { data: units },
    { data: activeLeases },
    { data: maintenanceCounts },
    { data: teamMemberRows },
    { data: buildings },
  ] = await Promise.all([
    supabase.from("units").select("*").eq("property_id", propertyId).is("deleted_at", null).order("unit_number"),
    supabase
      .from("leases")
      .select("unit_id, id, tenant_id, tenants(id, contacts(id, first_name, last_name, company_name))")
      .eq("property_id", propertyId)
      .in("status", ["active", "notice"])
      .is("deleted_at", null),
    supabase
      .from("maintenance_requests")
      .select("unit_id")
      .eq("property_id", propertyId)
      .in("status", ["pending_review", "approved", "pending_landlord", "landlord_approved", "work_order_sent", "acknowledged", "in_progress", "pending_completion"]),
    service.from("user_orgs").select("user_id, role, user_profiles(id, full_name)").eq("org_id", orgId).is("deleted_at", null),
    service
      .from("buildings")
      .select("id, name, building_type, is_primary, is_visible_in_ui")
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false }),
  ])

  type AgentEntry = { id: string; name: string; initials: string; role: string }
  const agentMap: Record<string, AgentEntry> = {}
  const teamMembers: { userId: string; name: string; role: string }[] = []
  for (const m of teamMemberRows ?? []) {
    const profile = m.user_profiles as unknown as { full_name: string | null }
    const name = profile?.full_name || "Unnamed"
    agentMap[m.user_id] = {
      id: m.user_id,
      name,
      initials: name.split(" ").map((w: string) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase(),
      role: m.role,
    }
    teamMembers.push({ userId: m.user_id, name, role: m.role })
  }

  const tenantByUnit: Record<string, { name: string }> = {}
  for (const lease of activeLeases ?? []) {
    const t = lease.tenants as unknown as { id: string; contacts: { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null } } | null
    if (t?.contacts) tenantByUnit[lease.unit_id] = { name: displayName(t.contacts) }
  }

  const maintenanceByUnit: Record<string, number> = {}
  for (const req of maintenanceCounts ?? []) {
    maintenanceByUnit[req.unit_id] = (maintenanceByUnit[req.unit_id] || 0) + 1
  }

  const allUnits = (units ?? []) as UnitTabData[]
  return {
    activeUnits:     allUnits.filter((u) => !u.is_archived),
    archivedUnits:   allUnits.filter((u) => u.is_archived),
    buildings:       (buildings ?? []) as BuildingTabData[],
    tenantByUnit,
    maintenanceByUnit,
    agentMap,
    teamMembers,
  }
}

interface OverviewData {
  landlord: {
    id: string
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    entity_type?: string | null
    email?: string | null
    phone?: string | null
    registration_number?: string | null
  } | null
  allLandlords: { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null }[]
  activeUnits: OverviewUnit[]
  buildingCount: number
  arrearsCents: number
  arrearsCount: number
  managingAgentName: string | null
  activity: RecentActivityItem[]
  managingScheme: string | null
}

async function fetchOverviewData(
  supabase: CookieClient,
  service: ServiceClient,
  propertyId: string,
  orgId: string,
  landlordId: string | null,
  managingAgentId: string | null,
): Promise<OverviewData> {
  const [
    { data: units },
    landlordResult,
    { data: allLandlords },
    { data: buildings },
    { data: arrearsRows },
    { data: recentInspections },
    { data: recentLeases },
    managingAgentResult,
    managingSchemeResult,
  ] = await Promise.all([
    supabase.from("units").select("id, status, asking_rent_cents").eq("property_id", propertyId).is("deleted_at", null).eq("is_archived", false),
    landlordId
      ? supabase.from("landlord_view").select("id, first_name, last_name, company_name, entity_type, email, phone, registration_number").eq("id", landlordId).single()
      : Promise.resolve({ data: null }),
    service.from("landlord_view").select("id, first_name, last_name, company_name, email, phone").eq("org_id", orgId).is("deleted_at", null).order("first_name"),
    service.from("buildings").select("id").eq("property_id", propertyId).is("deleted_at", null).eq("is_visible_in_ui", true),
    supabase
      .from("rent_invoices")
      .select("total_amount_cents, amount_paid_cents")
      .eq("property_id", propertyId)
      .in("status", ["pending", "partial", "overdue"]),
    service
      .from("inspections")
      .select("id, type, scheduled_date, units(unit_number, properties(name))")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(3),
    service
      .from("leases")
      .select("id, status, created_at, tenants(contacts(first_name, last_name, company_name)), units(unit_number)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(3),
    managingAgentId
      ? service.from("user_orgs").select("user_profiles(full_name)").eq("user_id", managingAgentId).eq("org_id", orgId).limit(1)
      : Promise.resolve({ data: null }),
    service.from("contractors").select("name").eq("org_id", orgId).limit(1),
  ])

  // Arrears totals
  const arrearsCents = (arrearsRows ?? []).reduce((s, r) => s + Math.max(0, (r.total_amount_cents ?? 0) - (r.amount_paid_cents ?? 0)), 0)
  const arrearsCount = (arrearsRows ?? []).filter((r) => ((r.total_amount_cents ?? 0) - (r.amount_paid_cents ?? 0)) > 0).length

  // Managing agent name
  let managingAgentName: string | null = null
  if (managingAgentResult.data) {
    const rows = managingAgentResult.data as unknown as Array<{ user_profiles: { full_name: string | null } | null }>
    managingAgentName = rows[0]?.user_profiles?.full_name ?? null
  }

  // Managing scheme name (first contractor for now — simplified)
  const managingScheme = (managingSchemeResult.data as unknown as Array<{ name: string }> | null)?.[0]?.name ?? null

  // Build activity feed
  const activity: RecentActivityItem[] = []
  for (const insp of (recentInspections ?? []) as unknown as Array<{ id: string; type: string | null; scheduled_date: string | null; units: { unit_number: string } | null }>) {
    if (!insp.scheduled_date) continue
    activity.push({
      id:     `insp-${insp.id}`,
      colour: "blue",
      label:  `${(insp.type ?? "Inspection").replaceAll("_", " ")} scheduled`,
      sub:    insp.units?.unit_number ? `Unit ${insp.units.unit_number}` : null,
      date:   insp.scheduled_date,
    })
  }
  for (const lease of (recentLeases ?? []) as unknown as Array<{ id: string; status: string; created_at: string; tenants: { contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null; units: { unit_number: string } | null }>) {
    const tenant = lease.tenants?.contacts ? displayName(lease.tenants.contacts) : null
    activity.push({
      id:     `lease-${lease.id}`,
      colour: "purple",
      label:  `Lease ${lease.status === "active" ? "activated" : "created"}${tenant ? ` · ${tenant}` : ""}`,
      sub:    lease.units?.unit_number ? `Unit ${lease.units.unit_number}` : null,
      date:   lease.created_at,
    })
  }
  activity.sort((a, b) => b.date.localeCompare(a.date))

  return {
    landlord:       landlordResult.data as OverviewData["landlord"],
    allLandlords:   (allLandlords ?? []) as OverviewData["allLandlords"],
    activeUnits:    (units ?? []) as OverviewUnit[],
    buildingCount:  (buildings ?? []).length,
    arrearsCents,
    arrearsCount,
    managingAgentName,
    activity:       activity.slice(0, 5),
    managingScheme,
  }
}

interface OperationsData {
  inspections: RecentInspection[]
  maintenance: RecentMaintenance[]
  complianceItems: ComplianceItem[]
  auditItems: AuditItem[]
}

// ── Compliance helpers ────────────────────────────────────────────────────────

type LeaseRow = {
  id: string
  end_date: string | null
  cpa_applies: boolean
  auto_renewal_notice_sent_at: string | null
  units: unknown
  tenants: unknown
}

type DocRow = {
  id: string
  name: string
  document_type: string
  expiry_date: string | null
}

function leaseColour(days: number): "red" | "amber" | "grey" {
  if (days <= 30) return "red"
  if (days <= 60) return "amber"
  return "grey"
}

function cpaColour(days: number): "red" | "amber" | "blue" {
  if (days < 0) return "red"
  if (days <= 14) return "amber"
  return "blue"
}

function docColour(days: number): "red" | "amber" | "green" {
  if (days < 0) return "red"
  if (days <= 30) return "amber"
  return "green"
}

function buildLeaseCompliance(leases: LeaseRow[]): ComplianceItem[] {
  const now    = Date.now()
  const items: ComplianceItem[] = []
  for (const lease of leases) {
    if (!lease.end_date) continue
    const unit       = lease.units as { unit_number: string } | null
    const tenantRaw  = lease.tenants as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null
    const tenantName = tenantRaw?.contacts ? displayName(tenantRaw.contacts) : null
    const daysUntil  = Math.ceil((new Date(lease.end_date).getTime() - now) / (1000 * 60 * 60 * 24))
    items.push({
      id:     `exp-${lease.id}`,
      colour: leaseColour(daysUntil),
      label:  `Lease expiry${unit ? ` · Unit ${unit.unit_number}` : ""}${tenantName ? ` · ${tenantName}` : ""}`,
      date:   lease.end_date,
      link:   `/leases/${lease.id}`,
    })
    if (lease.cpa_applies && !lease.auto_renewal_notice_sent_at) {
      const noticeDate = subtractBusinessDays(new Date(lease.end_date), 20)
      const noticeStr  = noticeDate.toISOString().split("T")[0]
      const noticeDays = Math.ceil((noticeDate.getTime() - now) / (1000 * 60 * 60 * 24))
      items.push({
        id:     `cpa-${lease.id}`,
        colour: cpaColour(noticeDays),
        label:  `CPA s14 notice due${unit ? ` · Unit ${unit.unit_number}` : ""}`,
        date:   noticeStr,
        link:   `/leases/${lease.id}`,
      })
    }
  }
  return items
}

function buildDocCompliance(docs: DocRow[]): ComplianceItem[] {
  const now   = Date.now()
  const items: ComplianceItem[] = []
  for (const doc of docs) {
    if (!doc.expiry_date) continue
    const daysUntil = Math.ceil((new Date(doc.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24))
    items.push({
      id:     `doc-${doc.id}`,
      colour: docColour(daysUntil),
      label:  `${doc.name} expires`,
      date:   doc.expiry_date,
    })
  }
  return items
}

// ─────────────────────────────────────────────────────────────────────────────

async function fetchOperationsData(
  supabase: CookieClient,
  service: ServiceClient,
  propertyId: string,
  orgId: string,
): Promise<OperationsData> {
  const today = new Date().toISOString().split("T")[0]

  const [
    { data: inspections },
    { data: maintenance },
    { data: activeLeases },
    { data: propertyDocs },
    { data: auditRows },
  ] = await Promise.all([
    service
      .from("inspections")
      .select("id, type, status, scheduled_date, units(unit_number)")
      .eq("property_id", propertyId)
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_date", { ascending: true })
      .limit(3),
    service
      .from("maintenance_requests")
      .select("id, title, work_order_number, status, created_at, units(unit_number)")
      .eq("property_id", propertyId)
      .not("status", "in", "(cancelled,closed,completed)")
      .order("created_at", { ascending: false })
      .limit(3),
    service
      .from("leases")
      .select("id, end_date, cpa_applies, auto_renewal_notice_sent_at, units(unit_number), tenants(contacts(first_name, last_name, company_name))")
      .eq("property_id", propertyId)
      .in("status", ["active", "notice"])
      .not("end_date", "is", null)
      .gte("end_date", today),
    service
      .from("property_documents")
      .select("id, name, document_type, expiry_date")
      .eq("property_id", propertyId)
      .eq("org_id", orgId)
      .not("expiry_date", "is", null),
    service
      .from("audit_log")
      .select("id, action, table_name, created_at, changed_by")
      .eq("org_id", orgId)
      .eq("record_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const compliance = [
    ...buildLeaseCompliance((activeLeases ?? []) as unknown as LeaseRow[]),
    ...buildDocCompliance((propertyDocs ?? []) as unknown as DocRow[]),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return {
    inspections: (inspections ?? []).map((i) => ({
      id:             i.id,
      type:           i.type ?? null,
      status:         i.status,
      scheduled_date: i.scheduled_date ?? null,
      unit_number:    (i.units as unknown as { unit_number: string } | null)?.unit_number ?? null,
    })),
    maintenance: (maintenance ?? []).map((m) => ({
      id:                 m.id,
      title:              m.title,
      work_order_number:  m.work_order_number ?? null,
      status:             m.status,
      created_at:         m.created_at,
      unit_number:        (m.units as unknown as { unit_number: string } | null)?.unit_number ?? null,
    })),
    complianceItems: compliance.slice(0, 5),
    auditItems:      (auditRows ?? []).map((a) => ({
      id:               a.id,
      action:           a.action,
      table_name:       a.table_name,
      created_at:       a.created_at,
      changed_by_name:  null,
    })),
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id }   = await params
  const sp       = await searchParams
  const rawTab   = sp.tab ?? "overview"
  const activeTab: TabId = VALID_TABS.includes(rawTab as TabId) ? (rawTab as TabId) : "overview"

  const supabase   = await createClient()
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")
  const { org_id: orgId } = membership
  const tier              = membership.tier ?? "owner"

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (!property) notFound()

  const service = await createServiceClient()

  // Always fetch base units for mobile view + header stats
  const { data: baseUnits } = await supabase
    .from("units")
    .select("id, status, asking_rent_cents, unit_number")
    .eq("property_id", id)
    .is("deleted_at", null)
    .eq("is_archived", false)

  const addressParts  = [property.address_line1, property.suburb, property.city, property.province].filter(Boolean)
  const fullAddress   = addressParts.join(", ")
  const mapsQuery     = encodeURIComponent([...addressParts, "South Africa"].join(", "))
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`

  const totalRentCents = (baseUnits ?? []).reduce((s, u) => s + (u.asking_rent_cents ?? 0), 0)
  const occupied       = (baseUnits ?? []).filter((u) => u.status === "occupied").length

  const mobileUnits = (baseUnits ?? []).map((u) => ({
    id: u.id, unitNumber: u.unit_number, status: u.status,
    tenantName: null, rentCents: u.asking_rent_cents ?? 0, maintenanceCount: 0,
  }))

  // Tab-specific data fetching
  const [overviewData, unitsData, operationsData] = await Promise.all([
    activeTab === "overview"
      ? fetchOverviewData(supabase, service, id, orgId, property.landlord_id ?? null, property.managing_agent_id ?? null)
      : Promise.resolve(null),
    activeTab === "units" || activeTab === "documents"
      ? fetchUnitsTabData(supabase, service, id, orgId)
      : Promise.resolve(null),
    activeTab === "operations"
      ? fetchOperationsData(supabase, service, id, orgId)
      : Promise.resolve(null),
  ])

  // Documents only need property_documents
  const propertyDocs = activeTab === "documents"
    ? (await service.from("property_documents").select("id, name, document_type, storage_path, expiry_date, notes, created_at").eq("property_id", id).eq("org_id", orgId).order("created_at", { ascending: false })).data ?? []
    : []

  const typeLabel: Record<string, string> = { residential: "Residential", commercial: "Commercial", mixed: "Mixed use" }

  void formatZAR // used in mobile view import

  return (
    <div>
      <BackLink href="/properties" label="Properties" />

      {/* Mobile view */}
      <div className="lg:hidden">
        <MobilePropertyView
          propertyId={id}
          name={property.name}
          address={fullAddress}
          mapsUrl={googleMapsUrl}
          type={property.type ?? null}
          landlordName={null}
          landlordPhone={null}
          totalUnits={(baseUnits ?? []).length}
          occupiedUnits={occupied}
          vacantUnits={(baseUnits ?? []).filter((u) => u.status === "vacant").length}
          totalRentCents={totalRentCents}
          totalMaintenanceCount={0}
          units={mobileUnits}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-3xl font-bold">{property.name}</h1>
            {property.type && (
              <Badge variant="secondary" className="capitalize">
                {typeLabel[property.type] ?? property.type}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">{fullAddress}</p>
          <AgentPicker
            propertyId={id}
            currentAgentId={property.managing_agent_id ?? null}
            teamMembers={unitsData?.teamMembers ?? []}
          />
        </div>

        {/* Tabs */}
        <PropertyTabs activeTab={activeTab} propertyId={id} />

        {/* Tab content */}
        {activeTab === "overview" && overviewData && (
          <>
            {/* LandlordPicker rendered inline for assign flow */}
            {!property.landlord_id && (
              <div className="mb-4">
                <LandlordPicker
                  propertyId={id}
                  orgId={orgId}
                  landlords={overviewData.allLandlords}
                  current={null}
                />
              </div>
            )}
            <OverviewTab
              propertyId={id}
              property={{
                type:                  property.type ?? null,
                erf_number:            (property as unknown as Record<string, unknown>).erf_number as string | null ?? null,
                sectional_title_number: (property as unknown as Record<string, unknown>).sectional_title_number as string | null ?? null,
                is_sectional_title:    (property as unknown as Record<string, unknown>).is_sectional_title as boolean | null ?? null,
                levy_amount_cents:     (property as unknown as Record<string, unknown>).levy_amount_cents as number | null ?? null,
                description:           property.description ?? null,
              }}
              landlord={overviewData.landlord}
              activeUnits={overviewData.activeUnits}
              buildingCount={overviewData.buildingCount}
              arrearsCents={overviewData.arrearsCents}
              arrearsCount={overviewData.arrearsCount}
              mapsQuery={mapsQuery}
              googleMapsUrl={googleMapsUrl}
              managingAgentName={overviewData.managingAgentName}
              activity={overviewData.activity}
              managingScheme={overviewData.managingScheme}
            />
          </>
        )}

        {activeTab === "units" && unitsData && (
          <UnitsTab
            units={unitsData.activeUnits}
            archivedUnits={unitsData.archivedUnits}
            buildings={unitsData.buildings}
            propertyId={id}
            propertyName={property.name}
            propertyType={property.type ?? "residential"}
            tier={tier}
            tenantByUnit={unitsData.tenantByUnit}
            maintenanceByUnit={unitsData.maintenanceByUnit}
            orgId={orgId}
          />
        )}

        {activeTab === "documents" && (
          <PropertyDocumentsTab
            propertyId={id}
            initialDocuments={propertyDocs as Array<{
              id: string; name: string; document_type: string; storage_path: string;
              expiry_date: string | null; notes: string | null; created_at: string
            }>}
          />
        )}

        {activeTab === "operations" && operationsData && (
          <OperationsTab
            propertyId={id}
            inspections={operationsData.inspections}
            maintenance={operationsData.maintenance}
            complianceItems={operationsData.complianceItems}
            auditItems={operationsData.auditItems}
          />
        )}
      </div>
    </div>
  )
}
