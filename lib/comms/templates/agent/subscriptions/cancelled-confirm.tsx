/**
 * lib/comms/templates/agent/subscriptions/cancelled-confirm.tsx — Cancellation confirmation with data retention notice
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Sent immediately when agent cancels from Settings. Data readable/exportable
 *         for 12 months post-cancellation. Two CTAs: export and reactivate.
 */
// LEGAL-REVIEW-PENDING: attorney review required before wiring to live sends (ADDENDUM_57G §10.6)

import * as React from "react"
import { Row, Column, Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const CANCELLED_CONFIRM_SUBJECT = "Your Pleks subscription has been cancelled"

export interface CancelledConfirmEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  cancelledDate: string
  purgeEligibleAt: string
  daysUntilPurge: number
}

export function CancelledConfirmEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  cancelledDate,
  purgeEligibleAt,
  daysUntilPurge,
}: Readonly<CancelledConfirmEmailProps>) {
  const preview = `Your ${orgName} subscription was cancelled on ${cancelledDate}. Your data is safe and exportable until ${purgeEligibleAt}.`
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
      <Text style={h1}>
        Subscription cancelled — your data is safe until {purgeEligibleAt}
      </Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        Your <strong>{orgName}</strong> subscription was cancelled on{" "}
        <strong>{cancelledDate}</strong>. We&apos;ve confirmed the cancellation below.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          Your full property and lease history, documents, financials and communications remain
          fully readable and exportable until <strong>{purgeEligibleAt}</strong> — that&apos;s
          12 months from today ({daysUntilPurge} days).
        </Text>
        <Text style={{ ...boxRow, marginTop: 8 }}>
          After that date, all data is permanently and irrecoverably deleted per your agreement.
        </Text>
      </Section>

      <Text style={para}>
        You can reactivate at any time before <strong>{purgeEligibleAt}</strong> and everything
        will be exactly as you left it — all leases, tenants, documents and history intact.
      </Text>

      <Row style={{ margin: "24px 0" }}>
        <Column style={{ paddingRight: 8 }}>
          <EmailButton
            href={`${appUrl}/reports`}
            accentColor="#3f3f46"
          >
            Export all data
          </EmailButton>
        </Column>
        <Column style={{ paddingLeft: 8 }}>
          <EmailButton
            href={`${appUrl}/settings/subscription`}
            accentColor={branding.accentColor}
          >
            Reactivate
          </EmailButton>
        </Column>
      </Row>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
