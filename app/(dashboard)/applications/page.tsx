import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchApplications } from "@/lib/queries/portfolio"
import { ApplicationsPageClient } from "./ApplicationsPageClient"

export default async function ApplicationsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  const [, listingsResult] = await Promise.all([
    queryClient.prefetchQuery({
      queryKey: OPERATIONAL_QUERY_KEYS.applications(orgId),
      queryFn: () => fetchApplications(supabase, orgId),
      staleTime: STALE_TIME.applications,
    }),
    supabase
      .from("listings")
      .select("id, public_slug, asking_rent_cents, applications_count, status, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false }),
  ])

  const { data: listingsRaw, error: listingsError } = listingsResult
  if (listingsError) console.error("fetchListings failed:", listingsError.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listings = (listingsRaw ?? []) as any[]

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ApplicationsPageClient orgId={orgId} listings={listings ?? []} />
    </HydrationBoundary>
  )
}
