/**
 * app/(dashboard)/hoa/new/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { NewHOAForm } from "./NewHOAForm"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function NewHOAPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("NewHOAPage user_orgs", membershipError)

  if (!membership) redirect("/onboarding")

  // Firm tier only
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .eq("status", "active")
    .single()
    logQueryError("NewHOAPage subscriptions", subError)

  if (sub?.tier !== "firm") redirect("/hoa")

  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name, address_line1, city")
    .eq("org_id", membership.org_id)
    .order("name")
    logQueryError("NewHOAPage properties", propertiesError)

  return (
    <div>
      <BackLink href="/hoa" label="HOA / Body Corporate" />
      <NewHOAForm properties={properties ?? []} />
    </div>
  )
}
