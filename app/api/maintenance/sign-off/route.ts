/**
 * app/api/maintenance/sign-off/route.ts — agent sign-off: mark request completed, record cost allocations
 *
 * Route:  POST /api/maintenance/sign-off
 * Auth:   Supabase auth.getUser() + user_orgs membership check
 * Data:   maintenance_requests, maintenance_cost_allocations, trust_transactions, lease_charges,
 *         warranties, tenant_view, units, audit_log, communication_log
 * Notes:  Validates allocation sum matches actual_cost_cents. Tenant charges with next_invoice or
 *         separate_invoice create a lease_charge so they appear on the next rent run.
 *         M4 comm fires to tenant on completion (maintenance.completed). BUILD_63 Phase 6.
 *         workmanshipGuaranteeMonths > 0 auto-creates a warranty row (ADDENDUM_60B Step 3).
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { addMonths } from "date-fns"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { MaintenanceCompletedEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-completed"
import { deriveWarrantySubject } from "@/lib/maintenance/warranty"

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

function validateAllocations(totalCents: number, allocations: AllocationInput[]): string | null {
  if (totalCents > 0) {
    const sumCents = allocations.reduce((s, a) => s + a.amountCents, 0)
    if (sumCents !== totalCents) {
      return `Allocation total (${sumCents}) does not match request cost (${totalCents})`
    }
  }
  for (const a of allocations) {
    if (a.type === "tenant_charge" && !a.collectionMethod) {
      return "Tenant charges require a collection method"
    }
  }
  return null
}

async function insertAllocations(
  service: Service,
  orgId: string,
  requestId: string,
  userId: string,
  allocations: AllocationInput[],
) {
  const records = allocations.map((a) => ({
    org_id: orgId,
    request_id: requestId,
    allocation_type: a.type,
    amount_cents: a.amountCents,
    description: a.description.trim(),
    lease_clause_ref: a.clauseRef?.trim() || null,
    collection_method: a.type === "tenant_charge" ? (a.collectionMethod ?? null) : null,
    created_by: userId,
  }))
  return service
    .from("maintenance_cost_allocations")
    .insert(records)
    .select("id, allocation_type, amount_cents, description")
}

async function createWorkmanshipWarranty(
  service: Service,
  orgId: string,
  requestId: string,
  userId: string,
  request: {
    property_id: string | null
    unit_id: string | null
    title: string | null
    contractor_id: string | null
  },
  guaranteeMonths: number,
  guaranteeTerms: string | null | undefined,
): Promise<string | null> {
  if (guaranteeMonths <= 0 || !request.property_id) return null

  let contractorContactId: string | null = null
  if (request.contractor_id) {
    const { data: contractor } = await service
      .from("contractors")
      .select("contact_id")
      .eq("id", request.contractor_id)
      .single()
    contractorContactId = contractor?.contact_id ?? null
  }

  const completedAt = new Date()
  const { data: warranty } = await service
    .from("warranties")
    .insert({
      org_id:                        orgId,
      subject:                       deriveWarrantySubject({ title: request.title ?? "Maintenance" }),
      warranty_type:                 "workmanship",
      property_id:                   request.property_id,
      unit_id:                       request.unit_id ?? null,
      source_type:                   "maintenance_signoff",
      source_maintenance_request_id: requestId,
      contractor_id:                 contractorContactId,
      starts_on:                     completedAt.toISOString().split("T")[0],
      expires_on:                    addMonths(completedAt, guaranteeMonths).toISOString().split("T")[0],
      claim_notes:                   guaranteeTerms ?? null,
      created_by:                    userId,
    })
    .select("id")
    .single()
  return warranty?.id ?? null
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

  const { requestId, allocations, workmanshipGuaranteeMonths, workmanshipGuaranteeTerms } = await req.json() as {
    requestId: string
    allocations: AllocationInput[]
    workmanshipGuaranteeMonths?: number
    workmanshipGuaranteeTerms?: string | null
  }

  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 })
  if (!allocations?.length) return NextResponse.json({ error: "No allocations provided" }, { status: 400 })

  // Fetch the request
  const { data: request } = await service
    .from("maintenance_requests")
    .select("id, org_id, unit_id, property_id, lease_id, actual_cost_cents, status, tenant_id, title, contractor_id")
    .eq("id", requestId)
    .eq("org_id", membership.org_id)
    .single()

  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (request.status !== "pending_completion") {
    return NextResponse.json({ error: "Request is not pending completion" }, { status: 400 })
  }

  const validationError = validateAllocations(request.actual_cost_cents ?? 0, allocations)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

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

  const { data: created, error: allocError } = await insertAllocations(
    service, membership.org_id, requestId, user.id, allocations,
  )
  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 })

  await writeFinancialRecords(service, membership.org_id, requestId, user.id, request, allocations, created ?? [])

  // Auto-create workmanship warranty (ADDENDUM_60B)
  const warrantyId = await createWorkmanshipWarranty(
    service, membership.org_id, requestId, user.id,
    request as { property_id: string | null; unit_id: string | null; title: string | null; contractor_id: string | null },
    workmanshipGuaranteeMonths ?? 0,
    workmanshipGuaranteeTerms,
  )

  // Audit
  await service.from("audit_log").insert({
    org_id: membership.org_id,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { status: "completed", allocation_count: allocations.length, warranty_id: warrantyId },
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
