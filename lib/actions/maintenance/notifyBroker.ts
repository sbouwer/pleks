"use server"

/**
 * lib/actions/maintenance/notifyBroker.ts — notify the property's insurance broker of a critical incident
 *
 * Auth:   createServiceClient (invoked from agent-write-gated maintenance flows)
 * Data:   property_brokers → contacts; sends incident.critical_broker; logs communication_log
 * Notes:  Recipient routed via resolveCompanyContact (25A §3) — a broker org routes to its primary person,
 *         else the contact's own email (resolver-then-fallback, zero regression).
 */

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { resolveCompanyContact } from "@/lib/contacts/resolveCompanyContact"
import * as React from "react"
import {
  CriticalIncidentBrokerEmail,
  type CriticalIncidentBrokerProps,
} from "@/lib/comms/templates/maintenance/critical-incident-broker"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface NotifyBrokerParams {
  orgId: string
  maintenanceRequestId: string
  propertyId: string
  incidentTitle: string
  incidentDescription: string
  incidentDate: string
  unitLabel: string | null
  propertyName: string
  propertyAddress: string
  agencyName: string
  reportedByUserId: string
  reportedByName: string
}

export async function notifyBroker(params: NotifyBrokerParams): Promise<{ logId?: string; skipped?: string }> {
  const db = await createServiceClient()

  // Fetch broker for this property
  const { data: brokerRow, error: brokerRowError } = await db
    .from("property_brokers")
    .select("broker_contact_id, auto_notify_critical, notify_channels")
    .eq("property_id", params.propertyId)
    .single()
    logQueryError("notifyBroker property_brokers", brokerRowError)

  if (!brokerRow) return { skipped: "no_broker_assigned" }
  if (!brokerRow.auto_notify_critical) return { skipped: "auto_notify_disabled" }

  // Fetch broker contact email
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .select("id, first_name, last_name, email")
    .eq("id", brokerRow.broker_contact_id)
    .single()
    logQueryError("notifyBroker contacts", contactError)

  if (!contact?.email) return { skipped: "no_broker_email" }

  const brokerName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Broker"

  const [orgSettings, checklistResult] = await Promise.all([
    fetchOrgSettings(params.orgId),
    db.from("property_insurance_checklists")
      .select("state, confirmed_at, item_code")
      .eq("property_id", params.propertyId)
      .neq("state", "not_applicable"),
  ])

  const checklist = checklistResult.data ?? []

  // Resolve item labels from the catalogue so we can list them in the email
  const itemCodes = checklist.map((r) => r.item_code as string).filter(Boolean)
  const labelByCode: Record<string, string> = {}
  if (itemCodes.length > 0) {
    const { data: catalogue, error: catalogueError } = await db
      .from("insurance_checklist_items")
      .select("code, label")
      .in("code", itemCodes)
    logQueryError("notifyBroker insurance_checklist_items", catalogueError)
    for (const item of catalogue ?? []) {
      labelByCode[item.code as string] = item.label as string
    }
  }

  const confirmedItems = checklist
    .filter((r) => r.state === "confirmed")
    .map((r) => labelByCode[r.item_code as string] ?? (r.item_code as string))

  const unknownItems = checklist
    .filter((r) => r.state === "unknown")
    .map((r) => labelByCode[r.item_code as string] ?? (r.item_code as string))

  const confirmedDates = checklist
    .filter((r) => r.state === "confirmed")
    .map((r) => r.confirmed_at as string | null)
    .filter((d): d is string => !!d)
  const latestConfirmedAt = confirmedDates.toSorted((a, b) => a.localeCompare(b)).at(-1) ?? null
  const coverageLastVerified = latestConfirmedAt
    ? new Date(latestConfirmedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null

  const branding = buildBranding(orgSettings)
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"

  const emailProps: CriticalIncidentBrokerProps = {
    branding,
    propertyName:        params.propertyName,
    propertyAddress:     params.propertyAddress,
    unitLabel:           params.unitLabel,
    incidentTitle:       params.incidentTitle,
    incidentDescription: params.incidentDescription,
    incidentDate:        params.incidentDate,
    reportedByName:      params.reportedByName,
    agencyName:          params.agencyName,
    appUrl,
    maintenanceRequestId: params.maintenanceRequestId,
    coverageLastVerified,
    confirmedItems:      confirmedItems.length > 0 ? confirmedItems : undefined,
    unknownItems:        unknownItems.length > 0   ? unknownItems   : undefined,
  }

  const brokerResolved = contact.id ? await resolveCompanyContact(db, params.orgId, contact.id, "general", "email") : null
  const result = await sendEmail({
    orgId:       params.orgId,
    templateKey: "incident.critical_broker",
    to: { email: brokerResolved?.email ?? contact.email, name: brokerResolved?.name ?? brokerName, contactId: brokerResolved?.contactId ?? contact.id },
    subject:     `Critical incident: ${params.incidentTitle} — ${params.propertyName}`,
    emailElement: React.createElement(CriticalIncidentBrokerEmail, emailProps),
    bodyPreview: `Critical incident reported at ${params.propertyName}: ${params.incidentTitle}`,
    entityType:       "maintenance_request",
    entityId:         params.maintenanceRequestId,
    triggeredBy:      params.reportedByUserId,
    templateCategory: "maintenance",
  })

  // Log to incident_notifications
  await db.from("incident_notifications").insert({
    org_id:                params.orgId,
    maintenance_request_id: params.maintenanceRequestId,
    notified_party:        "broker",
    party_contact_id:      contact.id,
    channel:               "email",
    template_name:         "incident.critical_broker",
    communication_log_id:  result.logId ?? null,
    decision_by:           params.reportedByUserId,
    sent_at:               new Date().toISOString(),
    failed_reason:         result.error ?? null,
  })

  return { logId: result.logId }
}
