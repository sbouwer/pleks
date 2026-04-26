import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { MaintenanceNewForm } from "./MaintenanceNewForm"

async function resolveClauseNumbers(leaseId: string, orgId: string, service: Awaited<ReturnType<typeof createServiceClient>>) {
  const { data: selections } = await service
    .from("lease_clause_selections")
    .select("clause_key, order_position")
    .eq("lease_id", leaseId)
    .in("clause_key", ["maintenance_and_repairs", "maintenance_tenant_obligations"])

  if (!selections || selections.length === 0) return { maintenanceClause: null, tenantLiabilityClause: null }

  const maintenanceEntry = selections.find((s) => s.clause_key === "maintenance_and_repairs")
  const tenantEntry = selections.find((s) => s.clause_key === "maintenance_tenant_obligations")

  return {
    maintenanceClause: maintenanceEntry?.order_position ?? null,
    tenantLiabilityClause: tenantEntry?.order_position ?? null,
  }
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
