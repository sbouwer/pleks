/**
 * insurance.renewal_reminder — sent at T+7 post-renewal when checklist items
 * are still unverified. One email per renewal cycle; no further reminders.
 */

import * as React from "react"
import { Text, Hr, Button } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface RenewalReminderEmailProps {
  branding: OrgBranding
  propertyDisplay: string   // "Name — Address" or just name
  renewalDateFormatted: string
  unknownCount: number
  checklistUrl: string
}

export function RenewalReminderEmail({
  branding,
  propertyDisplay,
  renewalDateFormatted,
  unknownCount,
  checklistUrl,
}: Readonly<RenewalReminderEmailProps>) {
  const preview = `Insurance renewed for ${propertyDisplay} — ${unknownCount} checklist item${unknownCount === 1 ? "" : "s"} still outstanding`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Policy renewed — checklist items outstanding</Text>

      <Text style={para}>
        The insurance policy for <strong>{propertyDisplay}</strong> renewed on{" "}
        <strong>{renewalDateFormatted}</strong>.
      </Text>

      <Text style={para}>
        {unknownCount} verification item{unknownCount === 1 ? " is" : "s are"} still outstanding.
        Most policies are unchanged renewals of last year&apos;s terms — but if anything has shifted
        (replacement value, security warranties, broker), the checklist is the place to update.
      </Text>

      <Button
        href={checklistUrl}
        style={{
          backgroundColor: branding.accentColor ?? "#18181b",
          color: "#ffffff",
          padding: "12px 24px",
          borderRadius: "6px",
          fontWeight: 600,
          fontSize: "14px",
          textDecoration: "none",
          display: "inline-block",
          margin: "8px 0 20px",
        }}
      >
        Open the checklist
      </Button>

      <Hr style={divider} />

      <Text style={footnote}>
        This is a single reminder. The banner on the property page stays until
        the items are verified or you dismiss it. We won&apos;t email you again
        about this renewal.
      </Text>
    </EmailLayout>
  )
}

const para     = { fontSize: "15px", lineHeight: "1.6", color: "#18181b", margin: "0 0 14px" }
const heading  = { fontSize: "20px", fontWeight: 600, lineHeight: "1.3", color: "#18181b", margin: "0 0 16px" }
const divider  = { borderColor: "#e5e7eb", margin: "20px 0" }
const footnote = { fontSize: "13px", color: "#71717a", fontStyle: "italic" as const, margin: "0" }
