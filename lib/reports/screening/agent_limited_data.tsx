/**
 * lib/reports/screening/agent_limited_data.tsx — FitScore Stream 2 PDF for Limited Data Profile state
 *
 * Auth:   internal — rendered by the PDF generation route (Phase F)
 * Data:   FitScoreReportData assembled by the orchestrator and stored in applications.fitscore_*
 * Notes:  Distinct layout — not a degraded variant of the standard template.
 *         No composite score, no dimension breakdown, no narrative columns (engine refused to score).
 *         No applicant roster even for multi-applicant leases (LDP is lease-level).
 *         Available evidence section shows per-check pass/fail factual state.
 *         Material flags rendered if present. LDP summary from narrative engine if available.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.10, §10.6.
 */

import { Document, View, Text, StyleSheet } from "@react-pdf/renderer"
import { FlagBadge } from "./_primitives/FlagBadge"
import { TitleBlock, ReportPage } from "./_primitives/DocumentChrome"
import { colors, FONTS, sp } from "./_primitives/theme"
import type { FitScoreReportData, MaterialFlag } from "./_primitives/theme"

const S = StyleSheet.create({
  ldpHeader: {
    backgroundColor: colors.surface.paperSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.band.limited_data_profile.text,
    borderStyle: 'solid',
    padding: 10,
    marginBottom: 12,
  },
  ldpTitle: {
    fontSize: 11,
    fontFamily: FONTS.sans,
    fontWeight: 'bold',
    color: colors.band.limited_data_profile.text,
    marginBottom: 4,
  },
  ldpBody: {
    fontSize: 8.5,
    fontFamily: FONTS.sans,
    color: colors.text.soft,
    lineHeight: 1.5,
  },
  sectionHeader: {
    fontSize: 6.5,
    fontFamily: FONTS.sans,
    fontWeight: 'bold',
    color: colors.text.faint,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.surface.divider,
    marginTop: 12,
  },
  evidenceRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.surface.divider,
    alignItems: 'flex-start',
  },
  evidenceRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.surface.divider,
    backgroundColor: colors.surface.paperSoft,
    alignItems: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 1,
    marginRight: 6,
  },
  evidenceLabel: { fontSize: 8.5, fontFamily: FONTS.sans, fontWeight: 'bold', color: colors.text.primary, flex: 1 },
  evidenceNote:  { fontSize: 8,   fontFamily: FONTS.sans,                     color: colors.text.soft,    flex: 2, marginLeft: 4 },
})

interface EvidenceItem {
  label: string
  status: 'pass' | 'fail' | 'not_available' | 'pending'
  note?: string
}

const STATUS_COLORS: Record<string, string> = {
  pass:          '#1a5c3a',
  fail:          '#b91c1c',
  not_available: '#6b7280',
  pending:       '#92400e',
}

const STATUS_LABELS: Record<string, string> = {
  pass:          'PASSED',
  fail:          'FAILED',
  not_available: 'NOT AVAILABLE',
  pending:       'PENDING',
}

function EvidenceRow({ item, alt }: Readonly<{ item: EvidenceItem; alt: boolean }>) {
  const dotColor = STATUS_COLORS[item.status] ?? STATUS_COLORS.not_available
  const statusLabel = STATUS_LABELS[item.status] ?? 'UNKNOWN'

  return (
    <View style={alt ? S.evidenceRowAlt : S.evidenceRow}>
      <View style={[S.statusDot, { backgroundColor: dotColor }]} />
      <Text style={S.evidenceLabel}>{sp(item.label)}</Text>
      <Text style={[S.evidenceNote, { color: dotColor, fontFamily: FONTS.sans, fontWeight: 'bold', fontSize: 7.5, flex: 1 }]}>
        {statusLabel}
      </Text>
      {item.note !== undefined && (
        <Text style={S.evidenceNote}>{sp(item.note)}</Text>
      )}
    </View>
  )
}

function deriveEvidenceItems(data: FitScoreReportData): EvidenceItem[] {
  const items: EvidenceItem[] = []
  const snap = data.narrative.ldpSummary

  // Identity verification — always present in LDP state
  const identityStatus: EvidenceItem['status'] = data.materialFlags.some(f => f.flag === 'deceased_status')
    ? 'fail'
    : 'not_available'
  items.push({ label: 'Identity verification', status: identityStatus, note: 'Home Affairs DHA-NPR match' })

  // Bureau credit — always not_available for LDP (insufficient coverage was part of why LDP triggered)
  const hasBureauNote = data.materialFlags.some(f => f.flag === 'bureau_coverage_partial')
  items.push({
    label: 'Bureau credit data',
    status: 'not_available',
    note: hasBureauNote ? 'Partial bureau coverage — see material flags' : 'No bureau responses received',
  })

  // Income evidence
  const hasIncomeFlag = data.materialFlags.some(f => f.flag === 'material_income_discrepancy')
  const incomeStatus: EvidenceItem['status'] = hasIncomeFlag ? 'fail' : 'not_available'
  items.push({
    label: 'Income evidence',
    status: incomeStatus,
    note: hasIncomeFlag ? 'Income discrepancy flagged' : 'Insufficient income evidence for verification',
  })

  // LDP summary from narrative engine if available
  if (snap) {
    items.push({ label: 'Engine assessment', status: 'not_available', note: sp(snap) })
  }

  return items
}

function FlagsSection({ flags }: Readonly<{ flags: MaterialFlag[] }>) {
  if (flags.length === 0) return null
  return (
    <View>
      <Text style={S.sectionHeader}>Material Flags</Text>
      {flags.map((f, i) => (
        <FlagBadge key={`${f.flag}-${i}`} flag={f} />
      ))}
    </View>
  )
}

export function AgentLimitedDataReport({ data }: Readonly<{ data: FitScoreReportData }>) {
  const evidenceItems = deriveEvidenceItems(data)

  return (
    <Document
      title={`Pleks FitScore Report - Application ${data.applicationRef} - Limited Data Profile`}
      author="Pleks"
      subject="Rental screening evidence — Limited Data Profile"
      creator={`Pleks Stream 2 generator ${data.engineVersion}`}
    >
      <ReportPage data={data}>
        <TitleBlock data={data} />

        {/* LDP explanation block */}
        <View style={S.ldpHeader}>
          <Text style={S.ldpTitle}>FitScore Report — Limited Data Profile</Text>
          <Text style={S.ldpBody}>
            Pleks has not produced a numeric FitScore for this lease application because the available
            evidence falls below the threshold required for a confident composite assessment.
            The available evidence is summarised below.
          </Text>
        </View>

        {/* Available evidence */}
        <Text style={S.sectionHeader}>Available Evidence</Text>
        {evidenceItems.map((item, i) => (
          <EvidenceRow key={item.label} item={item} alt={i % 2 === 1} />
        ))}

        {/* Material flags if any */}
        <FlagsSection flags={data.materialFlags} />
      </ReportPage>
    </Document>
  )
}
