import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchInspections } from "@/lib/queries/portfolio"
import { InspectionsPageClient } from "./InspectionsPageClient"

export default async function InspectionsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.inspections(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchInspections(supabase as any),
    staleTime: STALE_TIME.inspections,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InspectionsPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
