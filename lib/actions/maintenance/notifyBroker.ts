"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import * as React from "react"
import {
  CriticalIncidentBrokerEmail,
  type CriticalIncidentBrokerProps,
} from "@/lib/comms/templates/maintenance/critical-incident-broker"

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
  const { data: brokerRow } = await db
    .from("property_brokers")
    .select("broker_contact_id, auto_notify_critical, notify_channels")
    .eq("property_id", params.propertyId)
    .single()

  if (!brokerRow) return { skipped: "no_broker_assigned" }
  if (!brokerRow.auto_notify_critical) return { skipped: "auto_notify_disabled" }

  // Fetch broker contact email
  const { data: contact } = await db
    .from("contacts")
    .select("id, first_name, last_name, email")
    .eq("id", brokerRow.broker_contact_id)
    .single()

  if (!contact?.email) return { skipped: "no_broker_email" }

  const brokerName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Broker"

  const orgSettings = await fetchOrgSettings(params.orgId)
  const branding    = buildBranding(orgSettings)
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"

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
  }

  const result = await sendEmail({
    orgId:       params.orgId,
    templateKey: "incident.critical_broker",
    to: { email: contact.email, name: brokerName, contactId: contact.id },
    subject:     `Critical incident: ${params.incidentTitle} — ${params.propertyName}`,
    emailElement: React.createElement(CriticalIncidentBrokerEmail, emailProps),
    bodyPreview: `Critical incident reported at ${params.propertyName}: ${params.incidentTitle}`,
    entityType:  "maintenance_request",
    entityId:    params.maintenanceRequestId,
    triggeredBy: params.reportedByUserId,
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
