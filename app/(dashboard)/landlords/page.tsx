/**
 * app/(dashboard)/landlords/page.tsx — Landlord portfolio list with SSR prefetch (server)
 *
 * Route:  /landlords
 * Auth:   Dashboard layout gateway; org-type guard redirects landlord-type orgs to /properties
 * Data:   fetchLandlords() prefetched via React Query + HydrationBoundary
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership, getCurrentOrgCapabilities } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLandlords } from "@/lib/queries/portfolio"
import { LandlordsPageClient } from "./LandlordsPageClient"

export default async function LandlordsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const caps = await getCurrentOrgCapabilities()
  if (!caps?.hasLandlordsList) redirect("/properties")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchLandlords(supabase as any, orgId),
    staleTime: STALE_TIME.landlords,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LandlordsPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
