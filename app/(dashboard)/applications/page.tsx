import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchApplications } from "@/lib/queries/portfolio"
import { ApplicationsPageClient } from "./ApplicationsPageClient"

export default async function ApplicationsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.applications(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchApplications(supabase as any),
    staleTime: STALE_TIME.applications,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ApplicationsPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
