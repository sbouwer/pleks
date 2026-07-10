/**
 * app/(dashboard)/hoa/new/page.tsx — new HOA / body corporate entity form (server)
 *
 * Route:  /hoa/new
 * Auth:   gatewaySSR() (agent session + org membership); the HOA product-line gate lives in ../layout.tsx
 * Data:   properties list — org-scoped via gatewaySSR db
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

  // Access is gated by the HOA PRODUCT LINE in app/(dashboard)/hoa/layout.tsx — not by tier. The old
  // `tier !== "firm"` check here encoded the residential "HOAs on the side" model (retired 2026-07-10);
  // it would now bounce every legitimate HOA-line org (hoa_studio/hoa_practice/…) straight back to /hoa.

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
