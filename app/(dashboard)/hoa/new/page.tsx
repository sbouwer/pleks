import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { NewHOAForm } from "./NewHOAForm"

export default async function NewHOAPage() {
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

  // Firm tier only
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .eq("status", "active")
    .single()

  if (sub?.tier !== "firm") redirect("/hoa")

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address_line1, city")
    .eq("org_id", membership.org_id)
    .order("name")

  return <NewHOAForm properties={properties ?? []} />
}
