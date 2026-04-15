import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchInspections } from "@/lib/queries/portfolio"
import { InspectionsPageClient } from "./InspectionsPageClient"

export default async function InspectionsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.inspections(orgId),
    queryFn: () => fetchInspections(supabase, orgId),
    staleTime: STALE_TIME.inspections,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InspectionsPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
