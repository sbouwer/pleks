/**
 * app/(dashboard)/suppliers/page.tsx — Suppliers page: prefetches contractors and hydrates the client view
 *
 * Route:  /suppliers
 * Auth:   getServerOrgMembership() gate; data via service client
 * Data:   prefetches contractors (fetchContractors) into react-query for SuppliersPageClient
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchContractors } from "@/lib/queries/portfolio"
import { SuppliersPageClient } from "./SuppliersPageClient"

export default async function ContractorsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchContractors(supabase as any, orgId),
    staleTime: STALE_TIME.contractors,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SuppliersPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
