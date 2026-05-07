/**
 * lib/comms/templates/agent/subscriptions/purge-warning-30d.tsx — 30-day data deletion warning
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Triggered 30 days before purge_eligible_at. Emphasises export and reactivation.
 *         Strong but not alarmist — agent has time to act.
 */
// LEGAL-REVIEW-PENDING: attorney review required before wiring to live sends (ADDENDUM_57G §10.6)

import * as React from "react"
import { Row, Column, Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PURGE_WARNING_30D_SUBJECT = "30 days until your Pleks data is scheduled for deletion"

export interface PurgeWarning30dEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  purgeEligibleAt: string
  cancelledDate: string
  daysUntilPurge: number
}

export function PurgeWarning30dEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  purgeEligibleAt,
  cancelledDate,
  daysUntilPurge,
}: Readonly<PurgeWarning30dEmailProps>) {
  const preview = `Reminder: all ${orgName} data is scheduled for permanent deletion on ${purgeEligibleAt} — 30 days from now.`
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
      <Text style={h1}>Data deletion scheduled in 30 days</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        This is a reminder that the <strong>{orgName}</strong> account was cancelled on{" "}
        <strong>{cancelledDate}</strong>.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          All data — properties, leases, tenants, documents, financials and communications — will
          be <strong>permanently and irrecoverably deleted</strong> on{" "}
          <strong>{purgeEligibleAt}</strong>, 30 days from now.
        </Text>
      </Section>

      <Text style={para}>
        If you want to keep any records, export them now using the button below. If you&apos;d
        like to continue using Pleks, you can reactivate before the deletion date and everything
        will be exactly as you left it.
      </Text>

      <Row style={{ margin: "24px 0" }}>
        <Column style={{ paddingRight: 8 }}>
          <EmailButton
            href={`${appUrl}/reports`}
            accentColor="#3f3f46"
          >
            Export all data now
          </EmailButton>
        </Column>
        <Column style={{ paddingLeft: 8 }}>
          <EmailButton
            href={`${appUrl}/settings/subscription`}
            accentColor={branding.accentColor}
          >
            Reactivate account
          </EmailButton>
        </Column>
      </Row>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#fef3c7", borderRadius: 6, padding: "12px 16px", margin: "16px 0", border: "1px solid #fcd34d" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
