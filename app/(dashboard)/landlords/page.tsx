import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLandlords } from "@/lib/queries/portfolio"
import { LandlordsPageClient } from "./LandlordsPageClient"

export default async function LandlordsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId, role } = membership
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
      <LandlordsPageClient orgId={orgId} role={role} />
    </HydrationBoundary>
  )
}
