"use server"

import { gateway } from "@/lib/supabase/gateway"
import { notifyBroker } from "./notifyBroker"
import { notifyOwner } from "./notifyOwner"
import { notifyScheme } from "./notifyScheme"

export type InsuranceDecision = "reported" | "declined" | "unsure"

export interface RecordInsuranceDecisionParams {
  requestId: string
  decision:  InsuranceDecision
  notes?:    string
}

export async function recordInsuranceDecision(
  params: RecordInsuranceDecisionParams,
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  // Fetch the maintenance request + property context
  const { data: req, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("id, title, description, property_id, unit_id, severity, insurance_decision, units(unit_number, properties(name, address_line1, address_line2, city))")
    .eq("id", params.requestId)
    .eq("org_id", orgId)
    .single()

  if (fetchErr || !req) return { error: "Maintenance request not found" }
  if (req.severity !== "critical") return { error: "Decision only applies to critical incidents" }
  // Allow re-recording if previous decision was "unsure"
  if (req.insurance_decision && req.insurance_decision !== "unsure") {
    return { error: "Decision already recorded" }
  }

  const now = new Date().toISOString()

  // Record the decision on the maintenance request
  const { error: updateErr } = await db
    .from("maintenance_requests")
    .update({
      insurance_decision:       params.decision,
      insurance_decision_at:    now,
      insurance_decision_by:    userId,
      insurance_decision_notes: params.notes ?? null,
    })
    .eq("id", params.requestId)
    .eq("org_id", orgId)

  if (updateErr) {
    console.error("[insuranceDecision] update error:", updateErr.message)
    return { error: "Could not record decision" }
  }

  await db.from("audit_log").insert({
    org_id:       orgId,
    table_name:   "maintenance_requests",
    record_id:    params.requestId,
    action:       "UPDATE",
    changed_by:   userId,
    new_values:   { insurance_decision: params.decision, notes: params.notes ?? null },
  })

  if (params.decision !== "reported") return {}

  // Fire notifications — fetch context needed by all three
  const unit     = req.units as unknown as { unit_number: string; properties: { name: string; address_line1: string; address_line2?: string; city?: string } } | null
  const property = unit?.properties ?? null

  if (!property) {
    console.error("[insuranceDecision] property not found for request", params.requestId)
    return {}
  }

  const propertyAddress = [property.address_line1, property.city].filter(Boolean).join(", ")
  const unitLabel       = unit?.unit_number ? `Unit ${unit.unit_number}` : null
  const incidentDate    = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

  // Fetch org name + acting agent display name for email body
  const [{ data: orgRow }, { data: userProfile }] = await Promise.all([
    db.from("organisations").select("name").eq("id", orgId).single(),
    db.from("user_profiles").select("first_name, last_name").eq("id", userId).single(),
  ])

  const agencyName  = orgRow?.name ?? "Your agency"
  const agentName   = userProfile ? [userProfile.first_name, userProfile.last_name].filter(Boolean).join(" ") : "Your agent"

  const sharedParams = {
    orgId,
    maintenanceRequestId: params.requestId,
    propertyId:           req.property_id,
    incidentTitle:        req.title,
    incidentDescription:  req.description ?? "",
    incidentDate,
    unitLabel,
    propertyName:         property.name,
    propertyAddress,
    agencyName,
    reportedByUserId:     userId,
  }

  // Notify broker + owner in parallel, scheme after a short delay (per spec: 15 min delay)
  // In this implementation the scheme email goes out immediately — the 15 min delay
  // requires a cron/queue which is deferred to the BUILD_58 comms infrastructure.
  const [brokerResult] = await Promise.all([
    notifyBroker({ ...sharedParams, reportedByName: agentName }),
    notifyOwner({
      ...sharedParams,
      agentName,
      brokerName:   null,   // resolved inside notifyBroker; we don't have it here
      brokerNotified: true,
    }),
  ])

  // Scheme notification (delayed in production — immediate here for now)
  await notifyScheme({ ...sharedParams, agentName, agentPhone: null })

  // Swallow broker/owner/scheme errors — decision was already recorded
  void brokerResult

  return {}
}
