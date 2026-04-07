import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLeases } from "@/lib/queries/portfolio"
import { LeasesPageClient } from "./LeasesPageClient"

export default async function LeasesPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchLeases(supabase as any, orgId),
    staleTime: STALE_TIME.leases,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeasesPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
