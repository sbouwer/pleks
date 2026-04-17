"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import * as React from "react"
import {
  CriticalIncidentOwnerEmail,
  type CriticalIncidentOwnerProps,
} from "@/lib/comms/templates/maintenance/critical-incident-owner"

interface NotifyOwnerParams {
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
  agentName: string
  brokerName: string | null
  brokerNotified: boolean
  reportedByUserId: string
}

export async function notifyOwner(params: NotifyOwnerParams): Promise<{ logId?: string; skipped?: string }> {
  const db = await createServiceClient()

  // Fetch the property landlord contact
  const { data: landlord } = await db
    .from("landlords")
    .select("contact_id, contacts(first_name, last_name, email)")
    .eq("property_id", params.propertyId)
    .single()

  if (!landlord?.contact_id) return { skipped: "no_landlord" }

  const contact = landlord.contacts as unknown as { first_name: string; last_name: string; email: string | null } | null
  if (!contact?.email) return { skipped: "no_owner_email" }

  const ownerName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Owner"

  const orgSettings = await fetchOrgSettings(params.orgId)
  const branding    = buildBranding(orgSettings)
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"

  const emailProps: CriticalIncidentOwnerProps = {
    branding,
    ownerName,
    propertyName:        params.propertyName,
    propertyAddress:     params.propertyAddress,
    unitLabel:           params.unitLabel,
    incidentTitle:       params.incidentTitle,
    incidentDescription: params.incidentDescription,
    incidentDate:        params.incidentDate,
    brokerName:          params.brokerName,
    brokerNotified:      params.brokerNotified,
    agencyName:          params.agencyName,
    agentName:           params.agentName,
    appUrl,
    maintenanceRequestId: params.maintenanceRequestId,
  }

  const result = await sendEmail({
    orgId:       params.orgId,
    templateKey: "incident.critical_owner",
    to: { email: contact.email, name: ownerName, contactId: landlord.contact_id },
    subject:     `Incident update: ${params.incidentTitle} — ${params.propertyName}`,
    emailElement: React.createElement(CriticalIncidentOwnerEmail, emailProps),
    bodyPreview: `Critical incident at ${params.propertyName}: ${params.incidentTitle}`,
    entityType:  "maintenance_request",
    entityId:    params.maintenanceRequestId,
    triggeredBy: params.reportedByUserId,
  })

  await db.from("incident_notifications").insert({
    org_id:                params.orgId,
    maintenance_request_id: params.maintenanceRequestId,
    notified_party:        "landlord",
    party_contact_id:      landlord.contact_id,
    channel:               "email",
    template_name:         "incident.critical_owner",
    communication_log_id:  result.logId ?? null,
    decision_by:           params.reportedByUserId,
    sent_at:               new Date().toISOString(),
    failed_reason:         result.error ?? null,
  })

  return { logId: result.logId }
}
