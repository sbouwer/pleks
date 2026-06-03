/**
 * app/(dashboard)/maintenance/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchMaintenance } from "@/lib/queries/portfolio"
import { MaintenancePageClient } from "./MaintenancePageClient"

interface Props { searchParams: Promise<{ contractor?: string }> }

export default async function MaintenancePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const contractorFilter = (await searchParams).contractor ?? null
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
      <MaintenancePageClient orgId={orgId} contractorFilter={contractorFilter} />
    </HydrationBoundary>
  )
}
