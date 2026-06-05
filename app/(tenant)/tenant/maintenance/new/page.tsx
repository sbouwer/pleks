/**
 * app/(tenant)/tenant/maintenance/new/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
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
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-3xl">Report a maintenance issue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your agent will be notified and will arrange for the issue to be addressed.
        </p>
      </div>
      <MaintenanceNewForm
        isPleksTemplate={isPleksTemplate}
        maintenanceClause={clauseNumbers.maintenanceClause}
        tenantLiabilityClause={clauseNumbers.tenantLiabilityClause}
      />
    </div>
  )
}
