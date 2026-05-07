/**
 * lib/comms/templates/tenant/rent/monthly-statement.tsx — monthly account statement email
 *
 * Data:   invoices, payments, closing balance, property label, org branding
 * Notes:  Non-mandatory transactional — sent by monthly-statement cron on each org's configured day.
 *         organisations.settings.preferences.monthly_statement_day controls the send day (default 3).
 *         BUILD_63 Phase 7 (F3).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface StatementInvoiceRow {
  invoiceNumber: string
  periodLabel: string
  totalDisplay: string
  balanceDisplay: string
  status: string
}

export interface StatementPaymentRow {
  paymentDate: string
  amountDisplay: string
  method: string
  receiptNumber: string
}

export interface MonthlyStatementEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  statementMonth: string
  invoices: StatementInvoiceRow[]
  payments: StatementPaymentRow[]
  closingBalanceDisplay: string
  senderName: string
}

export function MonthlyStatementEmail({
  branding,
  tenantName,
  propertyLabel,
  statementMonth,
  invoices,
  payments,
  closingBalanceDisplay,
  senderName,
}: Readonly<MonthlyStatementEmailProps>) {
  const preview = `Account statement — ${statementMonth} — ${propertyLabel} — Balance: ${closingBalanceDisplay}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>
      <Text style={h1}>Monthly Account Statement</Text>
      <Text style={para}>
        Please find your account statement for <strong>{statementMonth}</strong> for the property at{" "}
        <strong>{propertyLabel}</strong>.
      </Text>

      {invoices.length > 0 && (
        <Section style={box}>
          <Text style={sectionHead}>Invoices</Text>
          {invoices.map((inv, i) => (
            <React.Fragment key={i}>
              <Text style={boxRow}>
                <strong>{inv.invoiceNumber}</strong> · {inv.periodLabel}
              </Text>
              <Text style={boxRow}>
                Total: {inv.totalDisplay} · Balance: {inv.balanceDisplay} · {inv.status.toUpperCase()}
              </Text>
              {i < invoices.length - 1 && <Hr style={{ borderColor: "#e4e4e7", margin: "4px 0" }} />}
            </React.Fragment>
          ))}
        </Section>
      )}

      {payments.length > 0 && (
        <Section style={payBox}>
          <Text style={sectionHead}>Payments received</Text>
          {payments.map((p, i) => (
            <Text key={i} style={boxRow}>
              {p.paymentDate} — <strong>{p.amountDisplay}</strong> ({p.method}) · Ref: {p.receiptNumber}
            </Text>
          ))}
        </Section>
      )}

      <Section style={balBox}>
        <Text style={balLabel}>Closing balance</Text>
        <Text style={balValue}>{closingBalanceDisplay}</Text>
      </Section>

      <Text style={para}>
        If you have any queries about this statement, please contact {senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This statement is issued for informational purposes. Please retain a copy for your records.
      </Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 12px" }
const payBox:      React.CSSProperties = { background: "#f0fdf4", borderRadius: 6, padding: "12px 16px", margin: "0 0 12px", border: "1px solid #bbf7d0" }
const balBox:      React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const balLabel:    React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 4px" }
const balValue:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: 0 }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
