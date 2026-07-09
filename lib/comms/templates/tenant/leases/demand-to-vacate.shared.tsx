/**
 * lib/comms/templates/tenant/leases/demand-to-vacate.shared.tsx — Demand-to-Vacate suite shared chrome
 *
 * Data:   tenant name, domicilium service address, property, org branding, reference, dates
 * Notes:  Single-sources the House-format chrome + every paragraph that is BYTE-IDENTICAL across more
 *         than one of Notices 1–3 (LEG-NOTICES-01 / R7.3), so verbatim legal copy cannot drift between
 *         files. Notice-SPECIFIC paragraphs (breach opening/reservation/PIE) stay inline in their notice
 *         file. All three notices render behind the 'draft' gate (011 §25) until counsel Part F sign-off.
 *         This is the email/canonical body; the physical-service PDF (R-6) derives the same text in slice D.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DemandToVacateChromeProps {
  branding: OrgBranding
  preview: string
  today: string
  referenceNumber: string
  tenantName: string
  serviceAddress: string
  reLine: string            // notice-specific RE: line (bold, capitalised)
  propertyLabel: string
  children: React.ReactNode
}

/** House format: reference block · recipient (domicilium) · RE line · salutation. */
export function DemandToVacateChrome({
  branding, preview, today, referenceNumber, tenantName, serviceAddress, reLine, propertyLabel, children,
}: Readonly<DemandToVacateChromeProps>) {
  return (
    <EmailLayout preview={preview} branding={branding}>
      <Section style={refBlock}>
        <Text style={refLine}><strong>Date:</strong>{" "}{today}</Text>
        <Text style={refLine}><strong>Reference:</strong>{" "}{referenceNumber}</Text>
        <Text style={refLine}><strong>Sent via:</strong>{" "}Electronic communication (ECT Act 25 of 2002)</Text>
      </Section>

      <Text style={recipient}>
        <strong>To:</strong>{" "}{tenantName}
        <br /><strong>Service Address:</strong>{" "}{serviceAddress}
      </Text>

      <Text style={re}><strong>{reLine}</strong></Text>
      <Text style={re2}>{propertyLabel}</Text>

      <Hr style={divider} />

      <Text style={para}>Dear {tenantName},</Text>

      {children}
    </EmailLayout>
  )
}

/** Identical across Notices 1–3: the vacate demand. `prefix` carries Notice 1's "Following cancellation…"
 *  lead sentence so the vacate wording itself is single-sourced. */
export function VacateParagraph({
  landlordOrAgentName, vacateByDate, prefix,
}: Readonly<{ landlordOrAgentName: string; vacateByDate: string; prefix?: string }>) {
  return (
    <Text style={para}>
      {prefix}You are required to vacate the premises and return all keys to {landlordOrAgentName} by no
      later than {vacateByDate}.
    </Text>
  )
}

/** Identical across Notices 1–3: RHA joint outgoing inspection + deposit (Q16). */
export function InspectionParagraph({ landlordOrAgentName }: Readonly<{ landlordOrAgentName: string }>) {
  return (
    <Text style={para}>
      Kindly contact {landlordOrAgentName} to arrange the joint outgoing inspection of the premises
      contemplated by the Rental Housing Act 50 of 1999. Your deposit will be dealt with in accordance
      with that Act.
    </Text>
  )
}

/** Notices 2 & 3 (expiry / month-to-month): reservation of rights on post-termination receipts (Q15). */
export function ExpiryReservationParagraph({ leaseEndDate }: Readonly<{ leaseEndDate: string }>) {
  return (
    <Text style={para}>
      Any amounts received from you after {leaseEndDate} are accepted strictly on account of amounts owing
      and damages for occupation, without prejudice, and do not create or revive any tenancy.
    </Text>
  )
}

/** Notices 2 & 3 (expiry / month-to-month): holding-over / PIE consequence. */
export function HoldingOverPieParagraph({ vacateByDate }: Readonly<{ vacateByDate: string }>) {
  return (
    <Text style={para}>
      If you remain in occupation after {vacateByDate}, the landlord&apos;s position is that your continued
      occupation is without lawful basis. The landlord reserves its rights and may instruct its attorneys to
      approach the Court for an eviction order in terms of the Prevention of Illegal Eviction from and
      Unlawful Occupation of Land Act 19 of 1998 (PIE), together with such damages or other relief as may be
      recoverable in law, and legal costs.
    </Text>
  )
}

/** Identical across Notices 1–3: independent legal advice (Q9). */
export function LegalAdviceParagraph() {
  return <Text style={para}>You may wish to obtain independent legal advice regarding this matter.</Text>
}

/** Identical across Notices 1–3: the branchable citation line (data-held via legalCitations helpers). */
export function CitationLine({ text }: Readonly<{ text: string }>) {
  return <Text style={citation}><strong>Citation:</strong>{" "}{text}</Text>
}

/** Identical across Notices 1–3: the sign-off block. */
export function SignOff({ branding }: Readonly<{ branding: OrgBranding }>) {
  return (
    <>
      <Hr style={divider} />
      <Text style={signoff}>Yours faithfully,</Text>
      <Text style={signoff}><strong>{branding.orgName}</strong></Text>
      {(branding.orgPhone || branding.orgEmail) && (
        <Text style={contact}>{[branding.orgPhone, branding.orgEmail].filter(Boolean).join(" · ")}</Text>
      )}
    </>
  )
}

/** Body-paragraph style — exported so notice-specific paragraphs (Notice 1 reservation/PIE) match. */
export const para: React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.7", margin: "0 0 16px" }

const refBlock:  React.CSSProperties = { background: "#f4f4f5", borderRadius: 4, padding: "10px 16px", margin: "0 0 16px" }
const refLine:   React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "2px 0" }
const recipient: React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "0 0 16px", lineHeight: "1.5" }
const re:        React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const re2:       React.CSSProperties = { fontSize: 13, color: "#52525b", margin: "0 0 16px" }
const divider:   React.CSSProperties = { borderColor: "#e4e4e7", margin: "20px 0" }
const citation:  React.CSSProperties = { fontSize: 13, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const signoff:   React.CSSProperties = { fontSize: 14, color: "#18181b", margin: "4px 0" }
const contact:   React.CSSProperties = { fontSize: 12, color: "#52525b", margin: "4px 0" }
