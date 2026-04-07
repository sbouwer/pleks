import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchMaintenance } from "@/lib/queries/portfolio"
import { MaintenancePageClient } from "./MaintenancePageClient"

export default async function MaintenancePage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.maintenance(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchMaintenance(supabase as any),
    staleTime: STALE_TIME.maintenance,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MaintenancePageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
