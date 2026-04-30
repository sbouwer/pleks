/**
 * lib/comms/templates/feedback/feedback-reply.tsx — feedback.reply template
 *
 * Sent to the submitter when a platform admin replies to their feedback.
 */

import * as React from "react"
import { Text, Hr, Button } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface FeedbackReplyEmailProps {
  branding:        OrgBranding
  subject:         string
  replyBody:       string
  viewUrl:         string
}

export function FeedbackReplyEmail({
  branding,
  subject,
  replyBody,
  viewUrl,
}: Readonly<FeedbackReplyEmailProps>) {
  const preview = `We replied to your feedback: ${subject}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>We&apos;ve replied to your feedback</Text>

      <Text style={para}>
        You submitted feedback: <strong>{subject}</strong>
      </Text>

      <Text style={para}>{replyBody}</Text>

      <Button
        href={viewUrl}
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
        View feedback thread
      </Button>

      <Hr style={divider} />

      <Text style={footnote}>
        You can view and continue the conversation from your account.
      </Text>
    </EmailLayout>
  )
}

const para     = { fontSize: "15px", lineHeight: "1.6", color: "#18181b", margin: "0 0 14px" }
const heading  = { fontSize: "20px", fontWeight: 600, lineHeight: "1.3", color: "#18181b", margin: "0 0 16px" }
const divider  = { borderColor: "#e5e7eb", margin: "20px 0" }
const footnote = { fontSize: "13px", color: "#71717a", fontStyle: "italic" as const, margin: "0" }
