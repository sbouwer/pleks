/**
 * app/(tenant)/tenant/maintenance/new/page.tsx — tenant portal: report a new maintenance issue
 *
 * Route:  /tenant/maintenance/new
 * Auth:   getTenantSession (redirects to /login); lease/org from the session
 * Data:   lease.template_source drives the consent-clause references; the form posts via a server action
 * Notes:  Canon DetailPageLayout shell; the multi-step form lives in MaintenanceNewForm.
 */
import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { MaintenanceNewForm } from "./MaintenanceNewForm"

async function resolveClauseNumbers(_leaseId: string, _orgId: string, _service: Awaited<ReturnType<typeof createServiceClient>>) {
  // lease_clause_selections has no positional/order column — clause numbers aren't derivable here.
  // (This previously selected a phantom `order_position`, so the numbers were always null.) Kept as a
  // stable no-op so callers don't change; revisit if/when a clause-ordering source exists.
  return { maintenanceClause: null, tenantLiabilityClause: null }
}

export default async function PortalMaintenanceNewPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { leaseId, orgId, lease } = session

  const isPleksTemplate = lease.template_source === "pleks"
  let clauseNumbers = { maintenanceClause: null as number | null, tenantLiabilityClause: null as number | null }

  if (isPleksTemplate) {
    clauseNumbers = await resolveClauseNumbers(leaseId, orgId, service)
  }

  return (
    <DetailPageLayout
      category="Maintenance"
      backHref="/tenant/maintenance"
      title="Report a maintenance issue"
      sub="Your agent will be notified and will arrange for the issue to be addressed."
      facts={[]}
    >
      <DetailFullWidth>
        <MaintenanceNewForm
          isPleksTemplate={isPleksTemplate}
          maintenanceClause={clauseNumbers.maintenanceClause}
          tenantLiabilityClause={clauseNumbers.tenantLiabilityClause}
        />
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
