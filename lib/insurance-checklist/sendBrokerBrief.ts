"use server"

/**
 * lib/insurance-checklist/sendBrokerBrief.ts — sends the insurance coverage brief to the property broker
 *
 * Auth:   requireAgentWriteAccess (subscription-gated)
 * Data:   properties, property_brokers, contacts, incident_notifications; sends Resend email with HTML attachment
 */

import * as React from "react"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { resolveCompanyContact } from "@/lib/contacts/resolveCompanyContact"
import { fetchBrokerBriefData, renderBrokerBriefHTML } from "./generateBrokerBriefHTML"
import { ChecklistBriefEmail } from "@/lib/comms/templates/insurance/checklist-brief-email"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface SendBrokerBriefResult {
  ok:     boolean
  error?: string
}

export async function sendBrokerBrief(propertyId: string): Promise<SendBrokerBriefResult> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  const { db, userId, orgId } = gw

  // Verify property belongs to org
  const { data: prop, error: propErr } = await db
    .from("properties")
    .select("id, name, org_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single()

  if (propErr || !prop) return { ok: false, error: "Property not found" }

  // Fetch broker contact
  const { data: brokerRow, error: brokerRowError } = await db
    .from("property_brokers")
    .select("contact_id, contacts(primary_email, first_name, last_name, company_name)")
    .eq("property_id", propertyId)
    .eq("is_primary", true)
    .single()
    logQueryError("sendBrokerBrief property_brokers", brokerRowError)

  const broker = brokerRow?.contacts as unknown as {
    primary_email: string | null
    first_name: string | null
    last_name: string | null
    company_name: string | null
  } | null

  if (!broker?.primary_email) {
    return { ok: false, error: "No broker email on file — add a broker to this property first" }
  }

  // Build the brief HTML
  const data = await fetchBrokerBriefData(propertyId)
  if (!data) return { ok: false, error: "Could not generate brief — check property data" }

  const html = renderBrokerBriefHTML(data)

  // Convert to base64 for Resend attachment
  const htmlBase64 = Buffer.from(html, "utf-8").toString("base64")
  const filename = `insurance-brief-${data.propertyShortId}-${new Date().toISOString().slice(0, 10)}.html`

  const brokerName = [broker.first_name, broker.last_name].filter(Boolean).join(" ") || broker.company_name || "Broker"

  // Send email with HTML attachment
  const orgSettings = await fetchOrgSettings(orgId)
  const branding    = buildBranding(orgSettings)

  const emailElement = React.createElement(ChecklistBriefEmail, {
    branding,
    brokerName,
    propertyName: data.propertyName,
    agentName:    data.agentName,
    agentEmail:   data.agentEmail,
    agentPhone:   data.agentPhone,
  })

  const briefResolved = brokerRow?.contact_id ? await resolveCompanyContact(db, orgId, brokerRow.contact_id, "general", "email") : null
  const result = await sendEmail({
    orgId,
    templateKey:  "insurance.checklist_brief",
    to: { email: briefResolved?.email ?? broker.primary_email, name: briefResolved?.name ?? brokerName, contactId: briefResolved?.contactId ?? brokerRow?.contact_id ?? undefined },
    subject:      `Insurance coverage verification request — ${data.propertyName}`,
    emailElement,
    bodyPreview:  `Insurance verification request for ${data.propertyName} from ${branding.orgName}`,
    entityType:   "property",
    entityId:     propertyId,
    triggeredBy:  userId,
    attachments: [{
      filename,
      content:     htmlBase64,
      contentType: "text/html",
    }],
  })

  if (!result.success) {
    return { ok: false, error: result.error ?? "Email send failed" }
  }

  // Log to incident_notifications (re-using BUILD_59 audit infra)
  const { data: brokerContact, error: brokerContactError } = await db
    .from("property_brokers")
    .select("contact_id")
    .eq("property_id", propertyId)
    .eq("is_primary", true)
    .single()
    logQueryError("sendBrokerBrief property_brokers", brokerContactError)

  await db.from("incident_notifications").insert({
    org_id:               orgId,
    property_id:          propertyId,
    notified_party:       "broker",
    party_contact_id:     brokerContact?.contact_id ?? null,
    channel:              "email",
    template_name:        "insurance.checklist_brief",
    communication_log_id: result.logId ?? null,
    decision_by:          userId,
    sent_at:              new Date().toISOString(),
  })

  return { ok: true }
}
