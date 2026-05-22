/**
 * lib/reports/screening/_primitives/DocumentChrome.tsx — Document title block and footer for FitScore Stream 2 PDFs
 *
 * Notes: TitleBlock renders above the pillar header on page 1.
 *        ReportFooter is fixed on every page (disclaimer mandatory per §6.11).
 *        "How to Read" URL is version-specific — interpretationVersion from data, not the bare unversioned URL.
 *        Page numbers use @react-pdf/renderer render prop.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.11.
 */

import { View, Text, StyleSheet, Page } from "@react-pdf/renderer"
import type { ReactNode } from "react"
import { colors, fmtShortDate, FONTS, sp } from "./theme"
import type { FitScoreReportData } from "./theme"

// ─── Title block (page 1 only) ────────────────────────────────────────────────

const TS = StyleSheet.create({
  block:       { marginBottom: 10 },
  title:       { fontSize: 11, fontFamily: FONTS.sans, fontWeight: 'bold', color: colors.text.primary, marginBottom: 2 },
  sub:         { fontSize: 8.5, fontFamily: FONTS.sans,                   color: colors.text.soft,    marginBottom: 1 },
  meta:        { fontSize: 7.5, fontFamily: FONTS.sans,                   color: colors.text.faint,   marginTop: 3 },
  divider:     { borderBottomWidth: 1, borderBottomColor: colors.surface.divider, marginBottom: 10, marginTop: 6 },
})

export function TitleBlock({ data }: Readonly<{ data: FitScoreReportData }>) {
  const coPlural = data.coApplicantCount === 1 ? '' : 's'
  const applicantLine = data.coApplicantCount > 0
    ? `${sp(data.primaryApplicantName)} and ${data.coApplicantCount} co-applicant${coPlural}`
    : sp(data.primaryApplicantName)

  const metaLine = [
    `Generated: ${fmtShortDate(data.generatedAt)}`,
    `Engine ${sp(data.engineVersion)}`,
    `Narrative ${sp(data.narrativeVersion)}`,
    `Interpretation ${sp(data.interpretationVersion)}`,
  ].join(' · ')

  return (
    <View style={TS.block}>
      <Text style={TS.title}>Pleks · FitScore Report</Text>
      <Text style={TS.sub}>Lease application: {sp(data.unitLabel)}</Text>
      <Text style={TS.sub}>Applicant: {applicantLine}</Text>
      <Text style={TS.sub}>Reference: {sp(data.applicationRef)}</Text>
      <Text style={TS.meta}>{metaLine}</Text>
      <View style={TS.divider} />
    </View>
  )
}

// ─── Footer (fixed — repeats every page) ─────────────────────────────────────

const FS = StyleSheet.create({
  footer:      { position: 'absolute', bottom: 22, left: 40, right: 40 },
  topRule:     { borderTopWidth: 0.75, borderTopColor: colors.surface.divider, marginBottom: 4 },
  disclaimer:  { fontSize: 7.5, fontFamily: FONTS.sans, color: colors.text.soft,  lineHeight: 1.4, marginBottom: 3 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  metaLeft:    { flex: 1 },
  link:        { fontSize: 7, fontFamily: FONTS.sans, color: colors.text.faint, marginBottom: 1 },
  versionLine: { fontSize: 7, fontFamily: FONTS.sans, color: colors.text.faint },
  pageNum:     { fontSize: 7, fontFamily: FONTS.sans, color: colors.text.faint },
})

export function ReportFooter({ data }: Readonly<{ data: FitScoreReportData }>) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.pleks.co.za'
  const helpUrl = `${appUrl}/help/fitscore-report/${sp(data.interpretationVersion)}`
  const hashDisplay = `sha256:${sp(data.inputsHash).slice(0, 8)}...`

  const versionLine = [
    `Engine: ${sp(data.engineVersion)}`,
    `Narrative: ${sp(data.narrativeVersion)}`,
    `Interpretation: ${sp(data.interpretationVersion)}`,
    `Inputs hash: ${hashDisplay}`,
  ].join(' · ')

  return (
    <View style={FS.footer} fixed>
      <View style={FS.topRule} />
      <Text style={FS.disclaimer}>
        This report is structured screening evidence. It does not constitute a tenancy recommendation or approval.
        The agent or landlord makes the tenancy decision.
      </Text>
      <View style={FS.metaRow}>
        <View style={FS.metaLeft}>
          <Text style={FS.link}>How to read this report: {helpUrl}</Text>
          <Text style={FS.link}>POPIA access requests: privacy@pleks.co.za</Text>
          <Text style={FS.versionLine}>{versionLine}</Text>
        </View>
        <Text
          style={FS.pageNum}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </View>
  )
}

// ─── Report page wrapper ──────────────────────────────────────────────────────

const PS = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 68,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: FONTS.sans,
    backgroundColor: colors.surface.paper,
    color: colors.text.primary,
  },
})

interface ReportPageProps {
  data: FitScoreReportData
  children: ReactNode
}

export function ReportPage({ data, children }: Readonly<ReportPageProps>) {
  return (
    <Page size="A4" style={PS.page}>
      {children}
      <ReportFooter data={data} />
    </Page>
  )
}
