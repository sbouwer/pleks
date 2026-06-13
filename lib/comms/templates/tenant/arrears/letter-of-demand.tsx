/**
 * lib/comms/templates/tenant/arrears/letter-of-demand.tsx — formal letter of demand (A3)
 *
 * Data:   tenant name, property, amount, overdue period, payment deadline, org details
 * Notes:  Mandatory template — single formal voice, no tone variants.
 *         Contractual / common-law letter of demand for arrear rental (ADDENDUM_70B F-1 #3/#4 —
 *         NOT RHA s5(4), NOT CPA s65/s14). body_full stored verbatim for Tribunal evidence (BUILD_63 §8).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, EmailDetail, type OrgBranding } from "../../layout"
import { LegalFooter } from "../../LegalFooter"
import { lodCancellationBasis } from "../../legalCitations"

export interface LetterOfDemandEmailProps {
  branding: OrgBranding
  tenantName: string
  tenantAddress?: string
  propertyLabel: string        // full address + unit
  leaseStartDate: string       // "1 January 2024"
  amountOwedDisplay: string    // "R 12 000.00"
  monthsInArrears: number
  oldestOutstandingDate: string // "1 March 2025"
  paymentDeadlineDays: number   // typically 7
  referenceNumber: string       // arrears case id (short)
}

export function LetterOfDemandEmail({
  branding,
  tenantName,
  tenantAddress,
  propertyLabel,
  leaseStartDate,
  amountOwedDisplay,
  monthsInArrears,
  oldestOutstandingDate,
  paymentDeadlineDays,
  referenceNumber,
}: LetterOfDemandEmailProps) {
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })

  const preview = `LETTER OF DEMAND — ${amountOwedDisplay} overdue — Ref ${referenceNumber}`

  return (
    <EmailLayout preview={preview} branding={branding}>

      {/* Reference block */}
      <Section style={refBlock}>
        <Text style={refLine}><strong>Date:</strong> {today}</Text>
        <Text style={refLine}><strong>Reference:</strong> {referenceNumber}</Text>
        <Text style={refLine}><strong>Sent via:</strong> Electronic communication (ECT Act 25 of 2002)</Text>
      </Section>

      <Text style={recipient}>
        <strong>{tenantName}</strong>
        {tenantAddress && <><br />{tenantAddress}</>}
      </Text>

      <Text style={re}><strong>RE: LETTER OF DEMAND — ARREARS OF RENTAL</strong></Text>
      <Text style={re2}>{propertyLabel}</Text>

      <Hr style={divider} />

      <Text style={para}>Dear {tenantName},</Text>

      <Text style={para}>
        We act on behalf of the landlord/managing agent of the above property.{" "}
        We write to formally demand payment of rental arrears outstanding under your lease
        agreement for <strong>{propertyLabel}</strong>, which commenced on {leaseStartDate}.
      </Text>

      <Text style={para}>
        Despite previous reminders, the rental account reflects the following outstanding balance:
      </Text>

      <Section style={summaryBox}>
        <EmailDetail label="Tenant" value={tenantName} />
        <EmailDetail label="Property" value={propertyLabel} />
        <EmailDetail label="Overdue since" value={oldestOutstandingDate} />
        <EmailDetail label="Months in arrears" value={String(monthsInArrears)} />
        <EmailDetail label="Total amount demanded" value={amountOwedDisplay} />
      </Section>

      <Text style={demandHeading}>FORMAL DEMAND</Text>

      <Text style={para}>
        We hereby formally demand that you pay the amount of <strong>{amountOwedDisplay}</strong>{" "}
        within <strong>{paymentDeadlineDays} (seven) days</strong> of the date of this letter.
      </Text>

      <Text style={para}>
        In the event that payment is not received within the stipulated period, or a written
        payment arrangement is not agreed with us, the landlord reserves the right to:
      </Text>

      <Section style={{ padding: "0 0 0 24px" }}>
        <Text style={bullet}>
          • Cancel the lease agreement in accordance with {lodCancellationBasis()};
        </Text>
        <Text style={bullet}>
          • Apply to the Rental Housing Tribunal for an order against you;
        </Text>
        <Text style={bullet}>
          • Institute proceedings in the Magistrate&apos;s Court for recovery of the outstanding amount, plus costs.
        </Text>
      </Section>

      <Text style={para}>
        This letter does not constitute a notice of cancellation of the lease. It is a formal
        demand for payment as required before legal proceedings may be instituted.
      </Text>

      <Text style={para}>
        If you believe this demand is incorrect, or you have already made payment, please
        contact us <strong>immediately</strong> with proof of payment.
      </Text>

      <Hr style={divider} />

      <Text style={signoff}>Yours faithfully,</Text>
      <Text style={signoff}><strong>{branding.orgName}</strong></Text>
      {(branding.orgPhone || branding.orgEmail) && (
        <Text style={contact}>
          {[branding.orgPhone, branding.orgEmail].filter(Boolean).join(" · ")}
        </Text>
      )}

      <LegalFooter />
    </EmailLayout>
  )
}

const refBlock:       React.CSSProperties = { background: "#f4f4f5", borderRadius: 4, padding: "10px 16px", margin: "0 0 20px" }
const refLine:        React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "2px 0" }
const recipient:      React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "0 0 16px", lineHeight: "1.5" }
const re:             React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const re2:            React.CSSProperties = { fontSize: 13, color: "#52525b", margin: "0 0 16px" }
const divider:        React.CSSProperties = { borderColor: "#e4e4e7", margin: "20px 0" }
const para:           React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.7", margin: "0 0 16px" }
const summaryBox:     React.CSSProperties = { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "12px 16px", margin: "0 0 20px" }
const demandHeading:  React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.05em", margin: "20px 0 12px" }
const bullet:         React.CSSProperties = { fontSize: 13, color: "#3f3f46", lineHeight: "1.6", margin: "4px 0" }
const signoff:        React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "4px 0" }
const contact:        React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "4px 0" }
