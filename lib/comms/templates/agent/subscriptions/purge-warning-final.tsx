/**
 * lib/comms/templates/agent/subscriptions/purge-warning-final.tsx — Final 24-hour data deletion notice
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Triggered 1 day before purge_eligible_at. Clear and direct — this is the last chance.
 *         Strong heading, tight copy, two immediate CTAs.
 */
// LEGAL-REVIEW-PENDING: attorney review required before wiring to live sends (ADDENDUM_57G §10.6)

import * as React from "react"
import { Row, Column, Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PURGE_WARNING_FINAL_SUBJECT = "Final notice: your Pleks data is deleted tomorrow"

export interface PurgeWarningFinalEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  purgeEligibleAt: string
  cancelledDate: string
  daysUntilPurge: number
}

export function PurgeWarningFinalEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  purgeEligibleAt,
  cancelledDate,
  daysUntilPurge,
}: Readonly<PurgeWarningFinalEmailProps>) {
  const preview = `Final notice: all ${orgName} data is permanently deleted tomorrow (${purgeEligibleAt}). Export or reactivate before midnight.`
  return (
    <EmailLayout
      preview={preview}
      branding={branding}
      footerVariant="cancelled_purge_warning"
      subscriptionAlert={{
        settingsUrl: `${appUrl}/settings/subscription`,
        cancelledDate,
        purgeEligibleAt,
        daysUntilPurge,
        exportUrl: `${appUrl}/reports`,
      }}
    >
      <Text style={h1}>&#9888; Data deletion is tomorrow</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        Tomorrow — <strong>{purgeEligibleAt}</strong> — is the scheduled deletion date for{" "}
        <strong>{orgName}</strong>. After this point, your data cannot be recovered under any
        circumstances.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          All properties, leases, tenants, documents, financials and communications will be
          permanently deleted. This action is irreversible.
        </Text>
        <Text style={{ ...boxRow, marginTop: 8 }}>
          Export your data now, or reactivate before midnight tonight to keep everything.
        </Text>
      </Section>

      <Row style={{ margin: "24px 0" }}>
        <Column style={{ paddingRight: 8 }}>
          <EmailButton
            href={`${appUrl}/reports`}
            accentColor="#3f3f46"
          >
            Export all data — last chance
          </EmailButton>
        </Column>
        <Column style={{ paddingLeft: 8 }}>
          <EmailButton
            href={`${appUrl}/settings/subscription`}
            accentColor={branding.accentColor}
          >
            Reactivate now
          </EmailButton>
        </Column>
      </Row>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#fef2f2", borderRadius: 6, padding: "12px 16px", margin: "16px 0", border: "1px solid #fca5a5" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
