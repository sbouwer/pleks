/**
 * app/(dashboard)/leases/[leaseId]/demand-to-vacate/page.tsx — Demand-to-Vacate picker page
 *
 * Route:  /leases/[leaseId]/demand-to-vacate
 * Auth:   gatewaySSR (agent workspace); the picker's server actions re-gate per operation
 * Data:   leases (existence + org scope); the picker calls previewDemandToVacate / issueDemandToVacate
 * Notes:  LEG-NOTICES-01 Phase E-3. Residential-only + all guard states are enforced by the actions the
 *         picker calls — the page only proves the lease exists in this org. NOT wired into /demo.
 */

import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect, notFound } from "next/navigation"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { DemandToVacatePicker } from "./DemandToVacatePicker"

export default async function DemandToVacatePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { data: lease, error } = await gw.db
    .from("leases").select("id").eq("id", leaseId).eq("org_id", gw.orgId).maybeSingle()
  logQueryError("demand-to-vacate page lease", error)
  if (!lease) notFound()

  return <DemandToVacatePicker leaseId={leaseId} />
}
