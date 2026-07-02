/**
 * app/(dashboard)/hoa/new/page.tsx — new HOA / body corporate entity form (server)
 *
 * Route:  /hoa/new
 * Auth:   gatewaySSR() (agent session + org membership); firm-tier gate redirects others to /hoa
 * Data:   subscriptions (tier gate), properties list — org-scoped via gatewaySSR db
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { NewHOAForm } from "./NewHOAForm"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function NewHOAPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/onboarding")
  const { db, orgId } = gw

  // Firm tier only
  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()
    logQueryError("NewHOAPage subscriptions", subError)

  if (sub?.tier !== "firm") redirect("/hoa")

  const { data: properties, error: propertiesError } = await db
    .from("properties")
    .select("id, name, address_line1, city")
    .eq("org_id", orgId)
    .order("name")
    logQueryError("NewHOAPage properties", propertiesError)

  return (
    <div>
      <BackLink href="/hoa" label="HOA / Body Corporate" />
      <NewHOAForm properties={properties ?? []} />
    </div>
  )
}
