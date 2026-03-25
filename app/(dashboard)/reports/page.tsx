import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ReportsClient } from "./ReportsClient"

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier || "owner"

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name")

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Reports</h1>
      <ReportsClient
        tier={tier}
        properties={properties ?? []}
        orgId={orgId}
      />
    </div>
  )
}
