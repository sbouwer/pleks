/**
 * lib/reports/screening/_pdf/primitives/DocumentShell.tsx
 *
 * Single-page wrapper composing all chrome primitives. Each call = one PDF page.
 * Usage (in agent templates):
 *
 *   <Document>
 *     <DocumentShell data={data} section="Profile" showAuditStrip>
 *       {page1Content}
 *     </DocumentShell>
 *     <DocumentShell data={data} section="Financial Analysis">
 *       {page2Content}
 *     </DocumentShell>
 *   </Document>
 *
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { Page, StyleSheet } from "@react-pdf/renderer"
import type { ReactNode } from "react"
import { C, PAGE } from "./theme"
import type { FitScoreReportData } from "./theme"
import { Watermark }     from "./Watermark"
import { AuditStrip }    from "./AuditStrip"
import { RunningHeader } from "./RunningHeader"
import { PageFooter }    from "./PageFooter"

const S = StyleSheet.create({
  page: {
    paddingTop:        PAGE.paddingTop,
    paddingBottom:     PAGE.paddingBottom,
    paddingHorizontal: PAGE.paddingHorizontal,
    fontSize:          9.5,
    fontFamily:        'Inter Tight',
    backgroundColor:   C.surface.paper,
    color:             C.ink.primary,
  },
})

interface DocumentShellProps {
  data:           FitScoreReportData
  section:        string      // e.g. "Profile", "Financial Analysis"
  showAuditStrip?: boolean    // true on page 1 only
  children:       ReactNode
}

export function DocumentShell({
  data,
  section,
  showAuditStrip = false,
  children,
}: Readonly<DocumentShellProps>) {
  return (
    <Page size={PAGE.size} style={S.page}>
      <Watermark />
      {showAuditStrip && <AuditStrip data={data} />}
      <RunningHeader section={section} />
      {children}
      <PageFooter data={data} />
    </Page>
  )
}
