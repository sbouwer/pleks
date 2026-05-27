/**
 * lib/reports/screening/_pdf/primitives/DocumentShell.tsx
 *
 * Single-page wrapper composing all chrome primitives. Each call = one PDF page.
 * Usage (in agent templates):
 *
 *   <Document>
 *     <DocumentShell data={data} section="Profile">
 *       {page1Content}
 *     </DocumentShell>
 *     <DocumentShell data={data} section="Financial Analysis">
 *       {page2Content}
 *     </DocumentShell>
 *   </Document>
 *
 * AuditStrip removed — version metadata now lives in AttestationCard (body, last page only).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3 density retune.
 */

import { Page, StyleSheet } from "@react-pdf/renderer"
import type { ReactNode } from "react"
import { C, FONTS, PAGE } from "./theme"
import type { FitScoreReportData } from "./theme"
import { Watermark }     from "./Watermark"
import { RunningHeader } from "./RunningHeader"
import { PageFooter }    from "./PageFooter"

const S = StyleSheet.create({
  page: {
    paddingTop:        PAGE.paddingTop,
    paddingBottom:     PAGE.paddingBottom,
    paddingHorizontal: PAGE.paddingHorizontal,
    fontSize:          9.5,
    fontFamily:        FONTS.sans,
    backgroundColor:   C.surface.paper,
    color:             C.ink.primary,
  },
})

interface DocumentShellProps {
  data:     FitScoreReportData
  section:  string
  children: ReactNode
}

export function DocumentShell({ data, section, children }: Readonly<DocumentShellProps>) {
  return (
    <Page size={PAGE.size} style={S.page}>
      <Watermark />
      <RunningHeader
        section={section}
        applicantName={
          data.applicants.length >= 2
            ? `${data.applicants[0].fullName.split(/\s+/).at(-1) ?? data.applicants[0].fullName} + ${data.applicants.length - 1}, JOINT APPLICATION`
            : data.primaryApplicantName
        }
        applicationRef={data.applicationRef}
      />
      {children}
      <PageFooter data={data} />
    </Page>
  )
}
