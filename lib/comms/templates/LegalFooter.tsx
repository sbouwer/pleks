/**
 * lib/comms/templates/LegalFooter.tsx — shared statutory legal footer (ADDENDUM_70F §7 / 70B F-1 #11)
 *
 * Data:   the canonical ECTA recognition stack (legalCitations.ts) + optional issuing-basis line
 * Notes:  THE shared chrome for statutory notices. Before this, the ECTA footer was welded inline on
 *         only 2/10 statutory templates and WRONG on both (s23-only). Every statutory template now
 *         renders this so the recognition stack can never drift per-template again (the Truth-Pipeline
 *         pattern applied to the footer). Maps to the 70E `legalFooterSlot` block — when bodies migrate
 *         into the store (70E E3), the block renders this same component.
 *         `issuedUnder` carries the substantive RHA/CPA basis line (citation-as-data, legalCitations.ts).
 *         `capacityStatement` is the F3 capacity slot — gated: rendered only when explicit (reviewed)
 *         wording is passed; wording is pending counsel, so it stays OFF by default rather than shipping
 *         unreviewed legal text onto Tribunal-facing notices.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { ECTA_FOOTER_TEXT } from "./legalCitations"

export interface LegalFooterProps {
  /** Substantive issuing-basis line, e.g. "This notice is issued in terms of {basis}." Optional. */
  issuedUnder?: React.ReactNode
  /** F3 signing-capacity statement. Pass reviewed wording to render; pending counsel → off by default. */
  capacityStatement?: string
}

export function LegalFooter({ issuedUnder, capacityStatement }: Readonly<LegalFooterProps>) {
  return (
    <>
      <Hr style={divider} />
      {issuedUnder && <Text style={legalNote}>{issuedUnder}</Text>}
      {capacityStatement && <Text style={legalNote}>{capacityStatement}</Text>}
      <Text style={legalNote}>{ECTA_FOOTER_TEXT}</Text>
    </>
  )
}

const divider:   React.CSSProperties = { borderColor: "#e4e4e7", margin: "20px 0" }
const legalNote: React.CSSProperties = { fontSize: 11, color: "#71717a", lineHeight: "1.5", margin: "0 0 8px" }
