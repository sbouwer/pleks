/**
 * app/(dashboard)/maintenance/page.tsx — maintenance requests / work-orders list
 *
 * Route:  /maintenance
 * Auth:   getServerOrgMembership (agent workspace); redirects to /login if no org
 * Data:   fetchMaintenance(serviceClient, orgId), prefetched into React Query cache
 * Notes:  ?contractor=<id> scopes the list to one supplier (from a supplier's "View work
 *         orders" quick link); the optional ?name= rides along purely for the banner label.
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchMaintenance } from "@/lib/queries/portfolio"
import { MaintenancePageClient } from "./MaintenancePageClient"

interface Props { searchParams: Promise<{ contractor?: string; name?: string }> }

export default async function MaintenancePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const sp = await searchParams
  const contractorFilter = sp.contractor ?? null
  const contractorName = sp.name ?? null
  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.maintenance(orgId),
    queryFn: () => fetchMaintenance(supabase, orgId),
    staleTime: STALE_TIME.maintenance,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MaintenancePageClient orgId={orgId} contractorFilter={contractorFilter} contractorName={contractorName} />
    </HydrationBoundary>
  )
}
