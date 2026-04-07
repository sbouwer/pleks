import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchPayments } from "@/lib/queries/portfolio"
import { PaymentsPageClient } from "./PaymentsPageClient"

export default async function PaymentsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.payments(orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => fetchPayments(supabase as any),
    staleTime: STALE_TIME.payments,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PaymentsPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
