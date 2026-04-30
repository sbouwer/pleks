/**
 * lib/comms/templates/feedback/feedback-daily-digest.tsx — feedback.daily_digest template
 *
 * Daily summary of new feedback submissions sent to the platform admin inbox.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface DigestItem {
  id:       string
  role:     string
  category: string
  subject:  string
  rating:   number | null
}

export interface FeedbackDailyDigestEmailProps {
  branding:   OrgBranding
  date:       string
  items:      DigestItem[]
  inboxUrl:   string
}

export function FeedbackDailyDigestEmail({
  branding,
  date,
  items,
  inboxUrl,
}: Readonly<FeedbackDailyDigestEmailProps>) {
  const plural  = items.length === 1 ? "" : "s"
  const preview = `${items.length} new feedback submission${plural} on ${date}`
  const summary = items.length === 0
    ? "No new feedback submissions today."
    : `${items.length} new submission${plural} received today.`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Feedback digest — {date}</Text>

      <Text style={para}>{summary}</Text>

      {items.map((item) => {
        const ratingStr = item.rating == null ? "" : ` · ${item.rating}/5 ★`
        return (
          <div key={item.id} style={card}>
            <Text style={cardTitle}>{item.subject}</Text>
            <Text style={cardMeta}>{item.role} · {item.category}{ratingStr}</Text>
          </div>
        )
      })}

      <Hr style={divider} />

      <Text style={para}>
        <a href={inboxUrl} style={link}>Open feedback inbox →</a>
      </Text>
    </EmailLayout>
  )
}

const para      = { fontSize: "15px", lineHeight: "1.6", color: "#18181b", margin: "0 0 14px" }
const heading   = { fontSize: "20px", fontWeight: 600, lineHeight: "1.3", color: "#18181b", margin: "0 0 16px" }
const card      = { border: "1px solid #e5e7eb", borderRadius: "6px", padding: "12px 16px", marginBottom: "10px" }
const cardTitle = { fontSize: "14px", fontWeight: 600, color: "#18181b", margin: "0 0 4px" }
const cardMeta  = { fontSize: "13px", color: "#71717a", margin: "0" }
const divider   = { borderColor: "#e5e7eb", margin: "20px 0" }
const link      = { color: "#18181b", fontWeight: 600 }
