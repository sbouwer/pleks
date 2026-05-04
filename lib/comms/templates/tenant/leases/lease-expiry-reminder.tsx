/**
 * lib/comms/templates/tenant/leases/lease-expiry-reminder.tsx — lease expiry reminder T-30 (L9)
 *
 * Data:   tenant name, property label, lease end date, days remaining, org branding
 * Notes:  Mandatory — cannot be unsubscribed. Fires T-30 by lease-expiry-check cron.
 *         CPA s14 renewal notice (L8) fires separately at T-40 to T-80 business days.
 *         BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseExpiryReminderEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  leaseEndDate: string
  daysRemaining: number
  senderName: string
}

export function LeaseExpiryReminderEmail({
  branding,
  tenantName,
  propertyLabel,
  leaseEndDate,
  daysRemaining,
  senderName,
}: Readonly<LeaseExpiryReminderEmailProps>) {
  const preview = `Your lease at ${propertyLabel} expires in ${daysRemaining} days — action required`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your lease is expiring soon</Text>

      <Text style={para}>
        Your fixed-term lease for <strong>{propertyLabel}</strong> expires on{" "}
        <strong>{leaseEndDate}</strong> — that is {daysRemaining} days from today.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Your Options</Text>
        <Text style={boxRow}>
          <strong>Renew your lease</strong> — contact us to negotiate a new fixed-term or
          month-to-month arrangement.
        </Text>
        <Text style={boxRow}>
          <strong>Continue month-to-month</strong> — if no action is taken, your lease
          automatically converts to month-to-month under the same terms.
        </Text>
        <Text style={boxRow}>
          <strong>Vacate on expiry</strong> — give written notice to confirm your intention to
          vacate by {leaseEndDate}.
        </Text>
      </Section>

      <Text style={para}>
        Please contact {branding.orgEmail ?? senderName} as soon as possible to confirm your
        intentions so we can plan accordingly.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This notice is issued in accordance with the Rental Housing Act 50 of 1999. Your lease
        will automatically convert to a month-to-month tenancy on expiry unless either party
        gives notice of non-renewal.
      </Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "6px 0" }
const small:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
