/**
 * lib/comms/templates/tenant/arrears/reminder.tsx — arrears reminder email (A1/A2)
 *
 * Data:   tenant name, amount owed, property, sender name, tone variant, arrears-case reference
 * Notes:  Relational template — three tone variants via single component.
 *         Used as email fallback when WhatsApp/SMS unavailable (primarily A2).
 *         referenceNumber (arrears-case id prefix) threads the whole sequence — the LOD
 *         and final-notice carry the SAME ref, so subject + body match from reminder onward (O-16 R8).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface ArrearsReminderEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string       // e.g. "12 Oak St, Unit 3"
  amountOwedDisplay: string   // e.g. "R 4 500.00"
  daysOverdue: number
  step: 1 | 2
  tone: "friendly" | "professional" | "firm"
  senderName: string          // org name or "your agent"
  referenceNumber: string     // arrears-case id prefix — same ref the LOD/final-notice carry, so the sequence threads
}

export function ArrearsReminderEmail({
  branding,
  tenantName,
  propertyLabel,
  amountOwedDisplay,
  daysOverdue,
  step,
  tone,
  senderName,
  referenceNumber,
}: Readonly<ArrearsReminderEmailProps>) {
  const preview = step === 1
    ? `Rent reminder: ${amountOwedDisplay} overdue — ${propertyLabel} — Ref ${referenceNumber}`
    : `Follow-up: ${amountOwedDisplay} still outstanding — ${propertyLabel} — Ref ${referenceNumber}`

  const { heading, body, cta } = copy[tone][step]

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>{heading}</Text>

      <Text style={para}>{body(propertyLabel, amountOwedDisplay, daysOverdue, senderName)}</Text>

      <Section style={box}>
        <Text style={boxRow}><strong>Reference:</strong> {referenceNumber}</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Amount outstanding:</strong> {amountOwedDisplay}</Text>
        <Text style={boxRow}><strong>Days overdue:</strong> {daysOverdue}</Text>
      </Section>

      <Text style={para}>{cta(senderName)}</Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        If you have already made payment, please disregard this message. Contact{" "}
        {branding.orgEmail ?? senderName} to confirm allocation.
      </Text>
    </EmailLayout>
  )
}

type CopyEntry = {
  heading: string
  body: (property: string, amount: string, days: number, sender: string) => string
  cta: (sender: string) => string
}
type CopyMap = Record<"friendly" | "professional" | "firm", Record<1 | 2, CopyEntry>>

const copy: CopyMap = {
  friendly: {
    1: {
      heading: "Friendly reminder — rent overdue",
      body: (property, amount, days) =>
        `We noticed that your rent for ${property} is ${amount} overdue (${days} days). ` +
        `We know things can get busy, so this is just a quick heads-up to get things sorted.`,
      cta: (sender) =>
        `Please make payment at your earliest convenience or reply to this email to let us know if you need to discuss arrangements. ` +
        `We are here to help. — ${sender}`,
    },
    2: {
      heading: "Follow-up — rent still outstanding",
      body: (property, amount, days) =>
        `We are following up on our earlier reminder about the outstanding rent for ${property}. ` +
        `The overdue balance is ${amount} (${days} days past due).`,
      cta: (sender) =>
        `Please arrange payment or contact us to discuss a payment plan before further steps are required. ` +
        `We value your tenancy and would like to resolve this quickly. — ${sender}`,
    },
  },
  professional: {
    1: {
      heading: "Rent payment overdue",
      body: (property, amount, days) =>
        `This is a notice that your rent for ${property} is ${amount} overdue, ` +
        `${days} days past the due date. Please arrange payment as soon as possible.`,
      cta: (sender) =>
        `If you have already processed payment, please confirm by replying to this email. ` +
        `If you are experiencing difficulties, please contact us to discuss a payment arrangement. — ${sender}`,
    },
    2: {
      heading: "Second notice — rent payment required",
      body: (property, amount, days) =>
        `We write to advise that your rental account for ${property} remains ${amount} in arrears ` +
        `(${days} days overdue). This is a second and final informal reminder before formal steps are taken.`,
      cta: (sender) =>
        `Payment is required immediately, or a payment arrangement must be agreed with ${sender} within 48 hours.`,
    },
  },
  firm: {
    1: {
      heading: "NOTICE: Rent overdue",
      body: (property, amount, days) =>
        `Your rental account for ${property} reflects an overdue balance of ${amount} ` +
        `(${days} days past due). Immediate payment is required.`,
      cta: () =>
        `Failure to pay or contact us within 24 hours will result in formal escalation. ` +
        `Payment plans are available but must be arranged immediately.`,
    },
    2: {
      heading: "FINAL INFORMAL NOTICE — immediate payment required",
      body: (property, amount, days) =>
        `Despite a previous reminder, your rent of ${amount} for ${property} remains unpaid ` +
        `(${days} days overdue). This is your final informal notice.`,
      cta: () =>
        `A formal letter of demand will follow if payment or a confirmed arrangement is not received within 48 hours. ` +
        `Contact us immediately to avoid further action.`,
    },
  },
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const small:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
