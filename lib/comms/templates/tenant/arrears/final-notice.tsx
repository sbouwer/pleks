/**
 * lib/comms/templates/tenant/arrears/final-notice.tsx — final pre-cancellation notice (A4)
 *
 * Data:   tenant name, property, amount, days overdue, org details, reference
 * Notes:  Mandatory template — single formal legal voice.
 *         CPA s14 / lex commissoria pre-cancellation notice (citation per ADDENDUM_70B F-1 #1/#2;
 *         NOT RHA s5(4)). body_full stored verbatim for Tribunal evidence (BUILD_63 §8).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, EmailDetail, type OrgBranding } from "../../layout"
import { LegalFooter } from "../../LegalFooter"
import { finalNoticeCancellationBasis } from "../../legalCitations"

export interface FinalNoticeEmailProps {
  branding: OrgBranding
  tenantName: string
  tenantAddress?: string
  propertyLabel: string
  leaseStartDate: string
  amountOwedDisplay: string
  monthsInArrears: number
  oldestOutstandingDate: string
  cancellationNoticeDays: number  // typically 20 business days (CPA s14(2)(b)(ii) where CPA applies)
  referenceNumber: string
  /** Lease CPA-applicability snapshot (cpa_applies_at_signing) — selects the cure citation (F-1 #1).
   *  Undefined → the safe contractual + common-law basis renders. */
  cpaApplies?: boolean
}

export function FinalNoticeEmail({
  branding,
  tenantName,
  tenantAddress,
  propertyLabel,
  leaseStartDate,
  amountOwedDisplay,
  monthsInArrears,
  oldestOutstandingDate,
  cancellationNoticeDays,
  referenceNumber,
  cpaApplies,
}: FinalNoticeEmailProps) {
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })

  const preview = `FINAL NOTICE — lease cancellation in ${cancellationNoticeDays} days — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>

      {/* Reference block */}
      <Section style={refBlock}>
        <Text style={refLine}><strong>Date:</strong> {today}</Text>
        <Text style={refLine}><strong>Reference:</strong> {referenceNumber}</Text>
        <Text style={refLine}><strong>Sent via:</strong> Electronic communication (ECT Act 25 of 2002)</Text>
      </Section>

      <Text style={urgentBanner}>⚠ URGENT — FINAL NOTICE BEFORE LEASE CANCELLATION</Text>

      <Text style={recipient}>
        <strong>{tenantName}</strong>
        {tenantAddress && <><br />{tenantAddress}</>}
      </Text>

      <Text style={re}><strong>RE: FINAL NOTICE — INTENDED CANCELLATION OF LEASE AGREEMENT</strong></Text>
      <Text style={re2}>{propertyLabel}</Text>

      <Hr style={divider} />

      <Text style={para}>Dear {tenantName},</Text>

      <Text style={para}>
        We refer to our previous letter of demand dated prior to today and note that the outstanding
        rental arrears for <strong>{propertyLabel}</strong> (lease commenced {leaseStartDate}) remain
        unpaid. This constitutes a material breach of your lease agreement.
      </Text>

      <Section style={summaryBox}>
        <EmailDetail label="Tenant" value={tenantName} />
        <EmailDetail label="Property" value={propertyLabel} />
        <EmailDetail label="Overdue since" value={oldestOutstandingDate} />
        <EmailDetail label="Months in arrears" value={String(monthsInArrears)} />
        <EmailDetail label="Total arrears" value={amountOwedDisplay} />
      </Section>

      <Text style={demandHeading}>NOTICE OF INTENDED CANCELLATION</Text>

      <Text style={para}>
        Pursuant to <strong>{finalNoticeCancellationBasis(cpaApplies)}</strong>, this
        constitutes formal notice of the landlord&apos;s intention to cancel the lease agreement
        should the arrears of <strong>{amountOwedDisplay}</strong> not be paid in full, or a
        written payment arrangement not be agreed with us, within{" "}
        <strong>{cancellationNoticeDays} days</strong> of this notice.
      </Text>

      <Text style={para}>
        If the breach is not remedied within the period stated above, the landlord will be entitled to:
      </Text>

      <Section style={{ padding: "0 0 0 24px" }}>
        <Text style={bullet}>
          • Cancel the lease agreement and require you to vacate the premises;
        </Text>
        <Text style={bullet}>
          • Apply to the Rental Housing Tribunal and/or the Magistrate&apos;s Court for an eviction order;
        </Text>
        <Text style={bullet}>
          • Recover all outstanding amounts, holding-over damages, and legal costs from you.
        </Text>
      </Section>

      <Text style={para}>
        To avoid cancellation of your lease, you must either:
      </Text>

      <Section style={{ padding: "0 0 16px 24px" }}>
        <Text style={bullet}>
          (1) Pay the full amount of <strong>{amountOwedDisplay}</strong> before the deadline; or
        </Text>
        <Text style={bullet}>
          (2) Contact us <strong>immediately</strong> to enter into a written payment arrangement.
        </Text>
      </Section>

      <Text style={para}>
        This notice does not constitute cancellation of the lease. Cancellation will only occur
        after the expiry of the notice period without payment or arrangement.
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

const refBlock:      React.CSSProperties = { background: "#f4f4f5", borderRadius: 4, padding: "10px 16px", margin: "0 0 16px" }
const refLine:       React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "2px 0" }
const urgentBanner:  React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "10px 16px", fontSize: 14, fontWeight: 700, color: "#b91c1c", margin: "0 0 16px", textAlign: "center" as const }
const recipient:     React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "0 0 16px", lineHeight: "1.5" }
const re:            React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const re2:           React.CSSProperties = { fontSize: 13, color: "#52525b", margin: "0 0 16px" }
const divider:       React.CSSProperties = { borderColor: "#e4e4e7", margin: "20px 0" }
const para:          React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.7", margin: "0 0 16px" }
const summaryBox:    React.CSSProperties = { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "12px 16px", margin: "0 0 20px" }
const demandHeading: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.05em", margin: "20px 0 12px" }
const bullet:        React.CSSProperties = { fontSize: 13, color: "#3f3f46", lineHeight: "1.6", margin: "4px 0" }
const signoff:       React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "4px 0" }
const contact:       React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "4px 0" }
