"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import * as React from "react"
import {
  CriticalIncidentSchemeEmail,
  type CriticalIncidentSchemeProps,
} from "@/lib/comms/templates/maintenance/critical-incident-scheme"

interface NotifySchemeParams {
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
  agentPhone: string | null
  reportedByUserId: string
}

export async function notifyScheme(params: NotifySchemeParams): Promise<{ skipped?: string }> {
  const db = await createServiceClient()

  // Fetch the managing scheme for this property
  const { data: property } = await db
    .from("properties")
    .select("managing_scheme_id")
    .eq("id", params.propertyId)
    .single()

  if (!property?.managing_scheme_id) return { skipped: "no_managing_scheme" }

  const { data: scheme } = await db
    .from("managing_schemes")
    .select("id, name, managing_agent_contact_id, emergency_contact_id")
    .eq("id", property.managing_scheme_id)
    .single()

  if (!scheme) return { skipped: "scheme_not_found" }

  const contactId = scheme.managing_agent_contact_id ?? scheme.emergency_contact_id
  if (!contactId) return { skipped: "no_scheme_contact" }

  const { data: contact } = await db
    .from("contacts")
    .select("id, first_name, last_name, email")
    .eq("id", contactId)
    .single()

  if (!contact?.email) return { skipped: "no_scheme_email" }

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Managing agent"

  const orgSettings = await fetchOrgSettings(params.orgId)
  const branding    = buildBranding(orgSettings)
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"

  const emailProps: CriticalIncidentSchemeProps = {
    branding,
    schemeName:          scheme.name,
    propertyName:        params.propertyName,
    propertyAddress:     params.propertyAddress,
    unitLabel:           params.unitLabel,
    incidentTitle:       params.incidentTitle,
    incidentDescription: params.incidentDescription,
    incidentDate:        params.incidentDate,
    agencyName:          params.agencyName,
    agentName:           params.agentName,
    agentPhone:          params.agentPhone,
    appUrl,
    maintenanceRequestId: params.maintenanceRequestId,
  }

  const result = await sendEmail({
    orgId:       params.orgId,
    templateKey: "incident.critical_scheme",
    to: { email: contact.email, name: contactName, contactId: contact.id },
    subject:     `Critical incident: ${params.incidentTitle} — ${params.propertyName}`,
    emailElement: React.createElement(CriticalIncidentSchemeEmail, emailProps),
    bodyPreview: `Critical incident at ${params.propertyName}: ${params.incidentTitle}`,
    entityType:  "maintenance_request",
    entityId:    params.maintenanceRequestId,
    triggeredBy: params.reportedByUserId,
  })

  await db.from("incident_notifications").insert({
    org_id:                params.orgId,
    maintenance_request_id: params.maintenanceRequestId,
    notified_party:        "managing_scheme",
    party_contact_id:      contact.id,
    channel:               "email",
    template_name:         "incident.critical_scheme",
    communication_log_id:  result.logId ?? null,
    decision_by:           params.reportedByUserId,
    sent_at:               new Date().toISOString(),
    failed_reason:         result.error ?? null,
  })

  return {}
}
