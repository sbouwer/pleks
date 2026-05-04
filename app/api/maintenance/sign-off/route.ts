/**
 * app/api/maintenance/sign-off/route.ts — agent sign-off: mark request completed and record cost allocations
 *
 * Route:  POST /api/maintenance/sign-off
 * Auth:   Supabase auth.getUser() + user_orgs membership check
 * Data:   maintenance_requests, maintenance_cost_allocations, trust_transactions, lease_charges,
 *         tenant_view, units, audit_log, communication_log
 * Notes:  Validates allocation sum matches actual_cost_cents. Tenant charges with next_invoice or
 *         separate_invoice create a lease_charge so they appear on the next rent run.
 *         M4 comm fires to tenant on completion (maintenance.completed). BUILD_63 Phase 6.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { MaintenanceCompletedEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-completed"

type Service = Awaited<ReturnType<typeof createServiceClient>>

interface AllocationInput {
  type: "landlord_expense" | "tenant_charge"
  amountCents: number
  description: string
  collectionMethod?: "next_invoice" | "separate_invoice" | "deposit_deduction" | "already_paid"
  clauseRef?: string
}

type MaintenanceReq = {
  property_id: string | null
  unit_id: string | null
  lease_id: string | null
}

async function writeFinancialRecords(
  service: Service,
  orgId: string,
  requestId: string,
  userId: string,
  request: MaintenanceReq,
  allocations: AllocationInput[],
  created: Array<{ id: string; allocation_type: string; amount_cents: number; description: string }>,
): Promise<void> {
  const statementMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split("T")[0]

  for (const alloc of created.filter((a) => a.allocation_type === "landlord_expense")) {
    await service.from("trust_transactions").insert({
      org_id: orgId,
      property_id: request.property_id,
      unit_id: request.unit_id,
      lease_id: request.lease_id,
      transaction_type: "maintenance_expense",
      direction: "debit",
      amount_cents: alloc.amount_cents,
      description: alloc.description,
      maintenance_request_id: requestId,
      statement_month: statementMonth,
      created_by: userId,
    })
  }

  if (request.lease_id) {
    const today = new Date().toISOString().split("T")[0]
    for (const input of allocations) {
      if (
        input.type === "tenant_charge" &&
        (input.collectionMethod === "next_invoice" || input.collectionMethod === "separate_invoice")
      ) {
        await service.from("lease_charges").insert({
          org_id: orgId,
          lease_id: request.lease_id,
          description: input.description.trim(),
          charge_type: "maintenance_recovery",
          amount_cents: input.amountCents,
          start_date: today,
          payable_to: "landlord",
          is_active: true,
          created_by: userId,
        })
      }
    }
  }
}

async function fireCompletedComm(
  service: Service,
  requestId: string,
  tenantId: string,
  unitId: string,
  orgId: string,
  userId: string,
  requestTitle: string,
): Promise<void> {
  const [tenantRes, unitRes, orgSettings] = await Promise.all([
    service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", tenantId).single(),
    service.from("units").select("unit_number, properties(name)").eq("id", unitId).single(),
    fetchOrgSettings(orgId),
  ])
  const tenant = tenantRes.data
  const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
  if (!tenant?.email) return

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"

  await routeAndSend({
    orgId,
    tenantId,
    templateKey: "maintenance.completed",
    to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
    subject: `Maintenance work completed — ${requestTitle}`,
    emailElement: React.createElement(MaintenanceCompletedEmail, {
      branding: buildBranding(orgSettings),
      tenantName,
      propertyLabel,
      requestTitle,
      senderName: orgSettings?.name ?? "Pleks",
    }),
    entityType: "maintenance_request",
    entityId: requestId,
    triggeredBy: userId,
    triggerEventType: "maintenance_state",
    triggerEventId: requestId,
    toneVariant: "n/a",
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { requestId, allocations } = await req.json() as {
    requestId: string
    allocations: AllocationInput[]
  }

  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 })
  if (!allocations?.length) return NextResponse.json({ error: "No allocations provided" }, { status: 400 })

  // Fetch the request
  const { data: request } = await service
    .from("maintenance_requests")
    .select("id, org_id, unit_id, property_id, lease_id, actual_cost_cents, status, tenant_id, title")
    .eq("id", requestId)
    .eq("org_id", membership.org_id)
    .single()

  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (request.status !== "pending_completion") {
    return NextResponse.json({ error: "Request is not pending completion" }, { status: 400 })
  }

  // Validate allocation sum matches actual cost (if a cost is recorded)
  const totalCents = request.actual_cost_cents ?? 0
  if (totalCents > 0) {
    const sumCents = allocations.reduce((s, a) => s + a.amountCents, 0)
    if (sumCents !== totalCents) {
      return NextResponse.json(
        { error: `Allocation total (${sumCents}) does not match request cost (${totalCents})` },
        { status: 400 }
      )
    }
  }

  // Validate tenant charges have a collection method
  for (const a of allocations) {
    if (a.type === "tenant_charge" && !a.collectionMethod) {
      return NextResponse.json({ error: "Tenant charges require a collection method" }, { status: 400 })
    }
  }

  // Mark completed
  const { error: statusError } = await service
    .from("maintenance_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      agent_signoff_at: new Date().toISOString(),
      agent_signoff_by: user.id,
    })
    .eq("id", requestId)

  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })

  // Insert allocations
  const records = allocations.map((a) => ({
    org_id: membership.org_id,
    request_id: requestId,
    allocation_type: a.type,
    amount_cents: a.amountCents,
    description: a.description.trim(),
    lease_clause_ref: a.clauseRef?.trim() || null,
    collection_method: a.type === "tenant_charge" ? (a.collectionMethod ?? null) : null,
    created_by: user.id,
  }))

  const { data: created, error: allocError } = await service
    .from("maintenance_cost_allocations")
    .insert(records)
    .select("id, allocation_type, amount_cents, description")

  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 })

  await writeFinancialRecords(service, membership.org_id, requestId, user.id, request, allocations, created ?? [])

  // Audit
  await service.from("audit_log").insert({
    org_id: membership.org_id,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { status: "completed", allocation_count: records.length },
  })

  // M4 — notify tenant that work is complete
  if (request.tenant_id) {
    try {
      await fireCompletedComm(
        service,
        requestId,
        request.tenant_id as string,
        request.unit_id as string,
        membership.org_id,
        user.id,
        request.title as string,
      )
    } catch {
      // Comm non-fatal
    }
  }

  return NextResponse.json({ ok: true })
}
