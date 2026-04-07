import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchTenants } from "@/lib/queries/portfolio"
import { TenantsPageClient } from "./TenantsPageClient"

export default async function TenantsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId, role } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchTenants(supabase as any, orgId),
    staleTime: STALE_TIME.tenants,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TenantsPageClient orgId={orgId} role={role} />
    </HydrationBoundary>
  )
}
