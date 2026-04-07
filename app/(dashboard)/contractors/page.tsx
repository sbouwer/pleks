import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME, fetchContractors } from "@/lib/queries/portfolio"
import { ContractorsPageClient } from "./ContractorsPageClient"

export default async function ContractorsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId, role } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.contractors(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchContractors(supabase as any, orgId),
    staleTime: STALE_TIME.contractors,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ContractorsPageClient orgId={orgId} role={role} />
    </HydrationBoundary>
  )
}
