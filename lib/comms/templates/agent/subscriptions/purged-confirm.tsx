/**
 * lib/comms/templates/agent/subscriptions/purged-confirm.tsx — Account closure and data deletion confirmation
 *
 * Auth:   agent-facing; sent to last-known owner email address
 * Data:   props injected at send time — no DB access
 * Notes:  Sent immediately after purgeOrg() completes. The agency record may no longer exist
 *         in the DB at send time — branding is captured before purge and passed as props.
 *         No CTA included — account is gone and Settings link would 404.
 */
// LEGAL-REVIEW-PENDING: attorney review required before wiring to live sends (ADDENDUM_57G §10.6)

import * as React from "react"
import { Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export const PURGED_CONFIRM_SUBJECT = "Your Pleks account has been closed"

export interface PurgedConfirmEmailProps {
  branding: OrgBranding
  orgName: string
  recipientEmail: string
  purgedDate: string
}

export function PurgedConfirmEmail({
  branding,
  orgName,
  recipientEmail,
  purgedDate,
}: Readonly<PurgedConfirmEmailProps>) {
  const preview = `The ${orgName} account was closed on ${purgedDate} and all data has been permanently deleted.`
  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={h1}>Account closed</Text>

      <Text style={para}>
        The <strong>{orgName}</strong> account ({recipientEmail}) was closed on{" "}
        <strong>{purgedDate}</strong> and all associated data has been permanently deleted per
        the cancellation terms agreed at the time of subscription.
      </Text>

      <Text style={para}>
        No further action is required. Your billing has been fully cancelled and you will not
        receive any further charges.
      </Text>

      <Text style={para}>
        If you believe this is an error or have any questions, please contact Pleks support.
      </Text>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
