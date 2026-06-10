/**
 * app/(dashboard)/billing/page.tsx — payments & invoices (the billing area)
 *
 * Route:  /billing
 * Auth:   gateway + the 'billing' capability (owner / is_admin exempt) — RBAC P4; redirects to /403 otherwise
 * Data:   payments via fetchPayments (service client), prefetched into React Query
 */
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import { createServiceClient } from "@/lib/supabase/server"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME, fetchPayments } from "@/lib/queries/portfolio"
import { BillingPageClient } from "./BillingPageClient"

export default async function PaymentsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!(await hasCapability(gw, "billing"))) redirect("/403")

  const orgId = gw.orgId
  const queryClient = new QueryClient()
  const supabase = await createServiceClient()

  await queryClient.prefetchQuery({
    queryKey: OPERATIONAL_QUERY_KEYS.payments(orgId),
    queryFn: () => fetchPayments(supabase, orgId),
    staleTime: STALE_TIME.payments,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BillingPageClient orgId={orgId} />
    </HydrationBoundary>
  )
}
