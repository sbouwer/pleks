/**
 * app/(dashboard)/reports/page.tsx — reports hub: renders the tier-gated report catalogue
 *
 * Route:  /reports
 * Auth:   gatewaySSR() (redirects to /login if unauthenticated)
 * Data:   properties (org-scoped db) + user_orgs agent list and landlord_view via service client; getOrgTier(orgId)
 * Notes:  Desktop-only (mobile shows DesktopOnlyCard). Landlord names resolved from landlord_view to avoid a 3-level PostgREST join.
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { ReportsClient } from "./ReportsClient"
import { DesktopOnlyCard } from "@/components/mobile/DesktopOnlyCard"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function ReportsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { db, orgId } = gw
  const service = await createServiceClient()

  const [tier, propertiesRes, landlordIdsRes, agentOrgsRes] = await Promise.all([
    getOrgTier(orgId),
    db
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("properties")
      .select("landlord_id")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .not("landlord_id", "is", null),
    service
      .from("user_orgs")
      .select("user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("role", ["agent", "property_manager"]),
  ])

  // Deduplicate landlord IDs, then fetch names from landlord_view (avoids 3-level PostgREST join)
  const landlordIds = [...new Set(
    (landlordIdsRes.data ?? []).map((r) => r.landlord_id as string).filter(Boolean)
  )]
  const landlords: { id: string; name: string }[] = []
  if (landlordIds.length > 0) {
    const { data: lvRows, error: lvRowsError } = await service
      .from("landlord_view")
      .select("id, first_name, last_name, company_name, entity_type")
      .in("id", landlordIds)
    logQueryError("ReportsPage landlord_view", lvRowsError)
    for (const lv of lvRows ?? []) {
      const r = lv as { id: string; first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string }
      const name = r.entity_type === "organisation"
        ? (r.company_name ?? r.id)
        : `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.id
      landlords.push({ id: r.id, name })
    }
  }

  // Build agents list
  type AgentOrgRow = {
    user_id: string
    user_profiles: { full_name: string | null } | null
  }
  const agents: { id: string; name: string }[] = (agentOrgsRes.data ?? []).map((row) => {
    const r = row as unknown as AgentOrgRow
    return { id: r.user_id, name: r.user_profiles?.full_name ?? r.user_id }
  })

  return (
    <div>
      {/* Mobile: desktop-only gate */}
      <div className="lg:hidden">
        <DesktopOnlyCard title="Reports" description="Reports work best on a larger screen. Open Pleks on your computer to generate and download reports." />
      </div>
      {/* Desktop */}
      <div className="hidden lg:block">
        <h1 className="font-heading text-3xl mb-6">Reports</h1>
        <ReportsClient
          tier={tier}
          properties={propertiesRes.data ?? []}
          orgId={orgId}
          landlords={landlords}
          agents={agents}
        />
      </div>
    </div>
  )
}
