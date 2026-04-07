import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { ReportsClient } from "./ReportsClient"

export default async function ReportsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const [tier, propertiesRes] = await Promise.all([
    getOrgTier(orgId),
    supabase
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
  ])

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Reports</h1>
      <ReportsClient
        tier={tier}
        properties={propertiesRes.data ?? []}
        orgId={orgId}
      />
    </div>
  )
}
