/**
 * lib/comms/templates/tenant/rent/invoice-issued.tsx — monthly rent invoice notification email
 *
 * Data:   invoice details, property label, org branding
 * Notes:  Non-mandatory transactional — sent by invoice-generate cron on invoice insert.
 *         BUILD_63 Phase 7 (F1).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InvoiceIssuedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  periodFrom: string
  periodTo: string
  rentAmountDisplay: string
  otherChargesDisplay: string | null
  totalAmountDisplay: string
  paymentReference: string
  chargesBreakdown: { description: string; amount: string }[]
}

export function InvoiceIssuedEmail({
  branding,
  tenantName,
  propertyLabel,
  invoiceNumber,
  invoiceDate,
  dueDate,
  periodFrom,
  periodTo,
  rentAmountDisplay,
  otherChargesDisplay,
  totalAmountDisplay,
  paymentReference,
  chargesBreakdown,
}: Readonly<InvoiceIssuedEmailProps>) {
  const preview = `Rent invoice ${invoiceNumber} — ${totalAmountDisplay} due ${dueDate} — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>
      <Text style={h1}>Monthly Rent Invoice</Text>
      <Text style={para}>
        Your rent invoice for <strong>{propertyLabel}</strong> has been issued.
        Please ensure payment is made before <strong>{dueDate}</strong>.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Invoice — {invoiceNumber}</Text>
        <Text style={boxRow}><strong>Invoice date:</strong> {invoiceDate}</Text>
        <Text style={boxRow}><strong>Period:</strong> {periodFrom} – {periodTo}</Text>
        <Text style={boxRow}><strong>Due date:</strong> {dueDate}</Text>
        <Hr style={{ borderColor: "#d4d4d8", margin: "8px 0" }} />
        <Text style={boxRow}><strong>Rent:</strong> {rentAmountDisplay}</Text>
        {chargesBreakdown.map((c, i) => (
          <Text key={i} style={boxRow}>{c.description}: {c.amount}</Text>
        ))}
        {chargesBreakdown.length === 0 && otherChargesDisplay && (
          <Text style={boxRow}><strong>Other charges:</strong> {otherChargesDisplay}</Text>
        )}
        <Hr style={{ borderColor: "#d4d4d8", margin: "8px 0" }} />
        <Text style={totalRow}><strong>Total due: {totalAmountDisplay}</strong></Text>
      </Section>

      <Section style={refBox}>
        <Text style={refLabel}>Payment Reference</Text>
        <Text style={refValue}>{paymentReference}</Text>
        <Text style={refNote}>
          Use this reference for all EFT payments to ensure your payment is allocated correctly.
        </Text>
      </Section>

      <Text style={para}>
        If you have any questions about this invoice, please contact your managing agent.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This invoice was generated automatically. Use your payment reference when making an EFT
        payment. Do not reply directly to this email.
      </Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const totalRow:    React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "4px 0 0" }
const refBox:      React.CSSProperties = { background: "#eff6ff", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", border: "1px solid #bfdbfe" }
const refLabel:    React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 4px" }
const refValue:    React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "#1d4ed8", margin: "0 0 4px", letterSpacing: "0.03em" }
const refNote:     React.CSSProperties = { fontSize: 12, color: "#6b7280", margin: 0 }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
