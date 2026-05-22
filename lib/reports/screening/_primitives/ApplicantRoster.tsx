/**
 * lib/reports/screening/_primitives/ApplicantRoster.tsx — Multi-applicant factual roster for FitScore Stream 2 PDFs
 *
 * Notes: No per-applicant band or numeric composite (Decision #9 prohibition).
 *        ID numbers are NOT rendered — POPIA minimisation per §6.7.
 *        Bureau coverage lists only responding bureaus (Decision #7).
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.7.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { colors, fmtZAR, sp } from "./theme"
import type { FitScoreApplicantEntry } from "./theme"

interface Props {
  applicants: FitScoreApplicantEntry[]
}

const S = StyleSheet.create({
  sectionHeader: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.text.faint,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.surface.divider,
  },
  row:    { paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: colors.surface.divider },
  rowAlt: { paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: colors.surface.divider, backgroundColor: colors.surface.paperSoft },
  name:        { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.text.primary, marginBottom: 1 },
  nationality: { fontSize: 8, fontFamily: 'Helvetica',      color: colors.text.soft,    marginBottom: 4 },
  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metaItem:    { flexDirection: 'column' },
  metaLabel:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: colors.text.faint, textTransform: 'uppercase', marginBottom: 1 },
  metaValue:   { fontSize: 8,   fontFamily: 'Helvetica',      color: colors.text.primary },
})

function networkLabel(status: 'trusted' | 'adverse' | 'none', count: number): string {
  if (status === 'trusted') return `Trusted (${count} prior ${count === 1 ? 'tenancy' : 'tenancies'})`
  if (status === 'adverse') return 'Adverse history recorded'
  return 'No prior Pleks-network tenancies'
}

function ApplicantRow({ entry, alt }: Readonly<{ entry: FitScoreApplicantEntry; alt: boolean }>) {
  const bureauText = entry.respondingBureaus.length > 0
    ? entry.respondingBureaus.map(sp).join(', ')
    : 'None'
  const incomeText = `${fmtZAR(entry.verifiedIncomeCents)} (${Math.round(entry.incomeSharePct)}% of joint)`
  const verificationText = `${entry.verificationPassCount} of ${entry.verificationTotal} checks passed`

  return (
    <View style={alt ? S.rowAlt : S.row}>
      <Text style={S.name}>{entry.label} — {sp(entry.fullName)}</Text>
      <Text style={S.nationality}>{sp(entry.nationalityStatus)}</Text>
      <View style={S.metaRow}>
        <View style={S.metaItem}>
          <Text style={S.metaLabel}>Verified income</Text>
          <Text style={S.metaValue}>{incomeText}</Text>
        </View>
        <View style={S.metaItem}>
          <Text style={S.metaLabel}>Verification</Text>
          <Text style={S.metaValue}>{verificationText}</Text>
        </View>
        <View style={S.metaItem}>
          <Text style={S.metaLabel}>Bureau coverage</Text>
          <Text style={S.metaValue}>{bureauText}</Text>
        </View>
        <View style={S.metaItem}>
          <Text style={S.metaLabel}>Pleks-network history</Text>
          <Text style={S.metaValue}>{networkLabel(entry.pleksNetworkStatus, entry.pleksNetworkTenancyCount)}</Text>
        </View>
      </View>
    </View>
  )
}

export function ApplicantRoster({ applicants }: Readonly<Props>) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={S.sectionHeader}>Applicant Roster</Text>
      {applicants.map((entry, i) => (
        <ApplicantRow key={entry.label} entry={entry} alt={i % 2 === 1} />
      ))}
    </View>
  )
}
