/**
 * app/(dashboard)/leases/page.tsx — Leases page: prefetches the lease list and hydrates the client shell
 *
 * Route:  /leases
 * Auth:   getServerOrgMembership (dashboard layout gateway); redirects to /login if no membership
 * Data:   fetchLeases prefetched server-side into react-query, dehydrated into LeasesPageClient
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchLeases } from "@/lib/queries/portfolio"
import { getLeaseCreationGate } from "@/lib/leases/leaseCreationGate"
import { LeasesPageClient } from "./LeasesPageClient"

export default async function LeasesPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const isOwner = membership.role === "owner"
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  const gate = await getLeaseCreationGate(supabase, orgId)

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId),
    queryFn: () => fetchLeases(supabase, orgId),
    staleTime: STALE_TIME.leases,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeasesPageClient orgId={orgId} gate={gate} isOwner={isOwner} />
    </HydrationBoundary>
  )
}
