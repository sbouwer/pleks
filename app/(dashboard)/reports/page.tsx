import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { ReportsClient } from "./ReportsClient"

export default async function ReportsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { db, orgId } = gw
  const service = await createServiceClient()

  const [tier, propertiesRes, landlordPropsRes, agentOrgsRes] = await Promise.all([
    getOrgTier(orgId),
    db
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    db
      .from("properties")
      .select("landlord_id, landlords(contacts(first_name, last_name, company_name, entity_type))")
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

  // Deduplicate landlords by landlord_id
  type LandlordPropRow = {
    landlord_id: string | null
    landlords: { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
  }
  const seenLandlords = new Set<string>()
  const landlords: { id: string; name: string }[] = []
  for (const row of (landlordPropsRes.data ?? []) as unknown as LandlordPropRow[]) {
    const lid = row.landlord_id
    if (!lid || seenLandlords.has(lid)) continue
    seenLandlords.add(lid)
    const c = row.landlords?.contacts
    const name = c?.entity_type === "company"
      ? (c.company_name ?? lid)
      : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || lid
    landlords.push({ id: lid, name })
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
      <h1 className="font-heading text-3xl mb-6">Reports</h1>
      <ReportsClient
        tier={tier}
        properties={propertiesRes.data ?? []}
        orgId={orgId}
        landlords={landlords}
        agents={agents}
      />
    </div>
  )
}
