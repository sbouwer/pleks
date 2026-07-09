/**
 * Shared sub-components for property info-request emails.
 *
 * These are tiny, composable building blocks used across all info-request
 * templates (initials, reminders, internal notifications). They wrap
 * React Email primitives with the Pleks voice/spacing so every template
 * reads and renders consistently without copy-paste.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { popiaProcessingLine } from "../legalCitations"

const baseText = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#18181b",
}

const styles = {
  heading: {
    ...baseText,
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.3,
    margin: "0 0 12px",
  },
  para: {
    ...baseText,
    fontSize: 15,
    lineHeight: 1.6,
    margin: "0 0 14px",
  },
  emphasis: {
    ...baseText,
    fontWeight: 600,
  },
  bullet: {
    ...baseText,
    fontSize: 14,
    lineHeight: 1.6,
    margin: "6px 0",
    paddingLeft: 8,
  },
  signoffLine: {
    ...baseText,
    fontSize: 15,
    lineHeight: 1.5,
    margin: "0",
  },
  signoffBlock: {
    margin: "20px 0 0",
  },
  expiry: {
    ...baseText,
    fontSize: 13,
    color: "#52525b",
    fontStyle: "italic" as const,
    margin: "0 0 14px",
  },
  popia: {
    ...baseText,
    fontSize: 12,
    color: "#71717a",
    lineHeight: 1.5,
    margin: "24px 0 0",
  },
  reminderMeta: {
    ...baseText,
    fontSize: 13,
    color: "#71717a",
    lineHeight: 1.5,
    margin: "0 0 16px",
  },
}

/** Email H1 — used once per template at the top of the body */
export function EmailHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>
}

/** Standard paragraph — 15px, 1.6 line-height */
export function EmailParagraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>
}

/** Inline bold — use inside EmailParagraph for emphasis on property name etc. */
export function Strong({ children }: { children: React.ReactNode }) {
  return <span style={styles.emphasis}>{children}</span>
}

/** Small italic meta line — used for "just following up" context on reminders */
export function ReminderMeta({ children }: { children: React.ReactNode }) {
  return <Text style={styles.reminderMeta}>{children}</Text>
}

/**
 * Bullet list of items the recipient is being asked to provide.
 * Uses styled <Text> rather than <ul>/<li> because email client ul support
 * is inconsistent (especially Outlook + Gmail Go).
 */
export function RequestList({ items }: { items: string[] }) {
  return (
    <Section style={{ margin: "0 0 16px" }}>
      {items.map((item, i) => (
        <Text key={i} style={styles.bullet}>
          •&nbsp;&nbsp;{item}
        </Text>
      ))}
    </Section>
  )
}

/**
 * Expiry line above the POPIA footer. The "reply by email" fallback is offered by default, but MUST be
 * suppressed for banking requests (replyFallback={false}) — inviting account numbers into a plain email
 * contradicts the secure-form-only rule those templates state and is a security risk (O-16 R5).
 */
export function ExpiryLine({ days = 14, replyFallback = true }: Readonly<{ days?: number; replyFallback?: boolean }>) {
  return (
    <Text style={styles.expiry}>
      This is a secure link, valid for {days} days.
      {replyFallback && " If you'd prefer to send the details by email, just reply to this message."}
    </Text>
  )
}

/** POPIA notice — shown on every outbound external info-request email. Routes through the
 *  popiaProcessingLine SSOT so it can't drift to a different-strength rights statement (the
 *  "where applicable" erasure qualifier lives in one place — CD note, Phase D). */
export function POPIALine({ orgName }: { orgName: string }) {
  return <Text style={styles.popia}>{popiaProcessingLine(orgName)}</Text>
}

/** "Thanks, / {orgName}" signoff block */
export function EmailSignoff({ orgName }: { orgName: string }) {
  return (
    <Section style={styles.signoffBlock}>
      <Text style={styles.signoffLine}>Thanks,</Text>
      <Text style={{ ...styles.signoffLine, fontWeight: 600 }}>{orgName}</Text>
    </Section>
  )
}
