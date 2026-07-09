/**
 * lib/comms/templates/ApplicantLegalFooter.tsx — the Standard Applicant Footer (LEG-NOTICES-01 / R7.3)
 *
 * Notes:  The canonical POPIA + Information-Regulator footer for applicant-facing outcome emails (received /
 *         shortlisted / approved / declined). APPLICANT_POPIA_FOOTER_TEXT is the SINGLE SOURCE consumed by BOTH
 *         this component AND the seed/applications.ts twins — never re-transcribed, so a counsel tweak at
 *         Part F sign-off is a one-line edit that cannot drift (O-16-R6 / ADDENDUM_70G, Truth Pipeline at
 *         footer scale). Verbatim from the R7.3 counsel pack; do not author a variant.
 */
import * as React from "react"

/**
 * ⚠ LOAD-BEARING — do NOT "tidy" the phrase "where applicable". It is the qualifier that stops the footer
 * promising a deletion right we would REFUSE on a live application under our retention / legal-obligation
 * basis. It must survive every future copy edit. (CD ruling condition 2, 2026-07-09.)
 */
export const APPLICANT_POPIA_FOOTER_TEXT =
  "Your personal information is processed for the purpose of assessing your rental application, including tenant risk and affordability. You may request access to, correction of, or deletion of your personal information where applicable under the Protection of Personal Information Act 4 of 2013. Should you believe your personal information has been processed unlawfully, you may lodge a complaint with the Information Regulator (South Africa) — current contact details are published at www.inforegulator.org.za."

/**
 * Canonical Information Regulator reference — the WEBSITE, not the postal/email/phone details (those have
 * changed repeatedly, and a stale address on an immutable evidence record is a defect). Single source for every
 * IR reference in comms (R7.3; normalises the older justice.gov.za/inforeg references onto the current site).
 */
export const INFORMATION_REGULATOR_URL = "www.inforegulator.org.za"

const footerStyle: React.CSSProperties = { fontSize: 13, color: "#71717a", lineHeight: "1.6", margin: "16px 0 0" }

/** The Standard Applicant Footer, rendered verbatim from APPLICANT_POPIA_FOOTER_TEXT. */
export function ApplicantLegalFooter() {
  return <p style={footerStyle}>{APPLICANT_POPIA_FOOTER_TEXT}</p>
}
