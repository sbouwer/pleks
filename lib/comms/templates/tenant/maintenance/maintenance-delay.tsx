/**
 * lib/comms/templates/tenant/maintenance/maintenance-delay.tsx — maintenance delay notification (M6)
 *
 * Data:   tenant name, property label, request title, delay reason, optional revised date, org branding
 * Notes:  Relational template — tone_profile driven by org tone_tenant setting.
 *         Fires on maintenance_delay_event.insert (cron + manual). BUILD_63 Phase 6.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceDelayEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  delayReason: string
  revisedDate?: string
  senderName: string
  toneVariant?: "friendly" | "professional" | "firm"
}

function resolveOpener(toneVariant: "friendly" | "professional" | "firm"): string {
  if (toneVariant === "friendly") return "We wanted to give you a quick update on your maintenance request at"
  if (toneVariant === "firm")     return "Please be advised of the following update regarding your maintenance request at"
  return "We are writing to update you on your maintenance request at"
}

export function MaintenanceDelayEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  delayReason,
  revisedDate,
  senderName,
  toneVariant = "professional",
}: Readonly<MaintenanceDelayEmailProps>) {
  const preview = `Update on your maintenance request at ${propertyLabel}`
  const opener  = resolveOpener(toneVariant)

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Maintenance update — delay</Text>

      <Text style={para}>
        {opener} <strong>{propertyLabel}</strong>. Unfortunately there has been a delay:{" "}
        {delayReason}.
      </Text>

      <Section style={box}>
        <Text style={boxRow}><strong>Request:</strong> {requestTitle}</Text>
        {revisedDate ? (
          <Text style={boxRow}><strong>Revised date:</strong> {revisedDate}</Text>
        ) : (
          <Text style={boxRow}><strong>Next steps:</strong> We will contact you as soon as a revised date is confirmed.</Text>
        )}
      </Section>

      <Text style={para}>
        We apologise for the inconvenience. If you have any questions, please contact {senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:     React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:   React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:    React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const sign:   React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
