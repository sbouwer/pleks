/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail/operational/ApplicantDetailOperational.tsx
 *
 * §1 ApplicantDetail — Operational mode (N>=5). Row-per-applicant table; throughput-first
 * scanning. Context rail is absent — dissolved entirely into table columns. Zone 4 =
 * Disposition column (inline per-applicant signal). Framing: C.surface.paperSunk on header row.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.4/§10.3; see doctrine.md co-located.
 */
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "../../theme"
import type { FitScoreApplicantEntry } from "../../theme"

// ─── Network / bureau helpers ─────────────────────────────────────────────────

function networkCompact(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === 'trusted') return `${e.pleksNetworkTenancyCount} trusted`
  if (e.pleksNetworkStatus === 'adverse') return 'Adverse'
  return 'None'
}

function bureauCount(e: FitScoreApplicantEntry): string {
  const n = e.respondingBureaus.length
  if (n === 0) return 'None'
  return `${n} bureau${n === 1 ? '' : 's'}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  wrap:    { marginBottom: D.primitiveGap },
  secLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  4,
  },
  secSub: {
    fontFamily:  FONTS.sans,
    fontSize:    9,
    color:       C.ink.mute,
    marginBottom: D.primitiveGap,
    lineHeight:  1.4,
  },
  tabWrap: { borderWidth: 0.75, borderColor: C.rule.base, marginBottom: D.primitiveGap },
  tabHead: {
    flexDirection:     'row',
    paddingVertical:    7,
    paddingHorizontal:  D.cardPaddingX,
    borderBottomWidth:  0.75,
    borderBottomColor:  C.rule.strong,
    backgroundColor:    C.surface.paperSunk,
  },
  tabRow: {
    flexDirection:     'row',
    paddingVertical:    8,
    paddingHorizontal:  D.cardPaddingX,
    borderBottomWidth:  0.75,
    borderBottomColor:  C.rule.base,
  },
  tabRowAlt:  { backgroundColor: C.surface.paperDeeper },
  tabRowLast: { borderBottomWidth: 0 },
  tabHL: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  tabV: {
    fontFamily:    FONTS.mono,
    fontSize:      8.5,
    color:         C.ink.primary,
    letterSpacing: 0.2,
    lineHeight:    1.3,
  },
  tabVMute: { color: C.ink.mute },
  tabS: {
    fontFamily: FONTS.sans,
    fontSize:   7,
    color:      C.ink.mute,
    lineHeight: 1.35,
    marginTop:  1,
  },
  // Column widths
  tcL:  { flex: 0.5 },
  tcN:  { flex: 1.4 },
  tcNa: { flex: 1.2 },
  tcI:  { flex: 1.1 },
  tcV:  { flex: 0.8 },
  tcB:  { flex: 0.8 },
  tcNw: { flex: 0.9 },
})

// ─── Table row ────────────────────────────────────────────────────────────────

function OperationalRow({ entry, idx, isLast }: Readonly<{
  entry: FitScoreApplicantEntry
  idx:   number
  isLast: boolean
}>) {
  const isAlt  = idx % 2 === 1
  const netMuted = entry.pleksNetworkStatus === 'none'
  return (
    <View style={[S.tabRow, isAlt ? S.tabRowAlt : {}, isLast ? S.tabRowLast : {}]} wrap={false}>
      <View style={S.tcL}><Text style={S.tabV}>{entry.label}</Text></View>
      <View style={S.tcN}><Text style={S.tabV}>{sp(entry.fullName)}</Text></View>
      <View style={S.tcNa}><Text style={S.tabS}>{sp(entry.nationalityStatus)}</Text></View>
      <View style={S.tcI}>
        <Text style={S.tabV}>{fmtZAR(entry.verifiedIncomeCents)}</Text>
        <Text style={S.tabS}>{entry.incomeSharePct}% of joint</Text>
      </View>
      <View style={S.tcV}><Text style={S.tabV}>{entry.verificationPassCount} of {entry.verificationTotal}</Text></View>
      <View style={S.tcB}><Text style={S.tabV}>{bureauCount(entry)}</Text></View>
      <View style={S.tcNw}>
        <Text style={netMuted ? [S.tabV, S.tabVMute] : S.tabV}>{networkCompact(entry)}</Text>
      </View>
    </View>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailOperationalProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailOperational({ applicants }: Readonly<ApplicantDetailOperationalProps>) {
  return (
    <View style={S.wrap}>
      <Text style={S.secLabel}>APPLICANT DETAIL</Text>
      <Text style={S.secSub}>Participant context for all parties to this lease.</Text>
      <View style={S.tabWrap}>
        <View style={S.tabHead}>
          <View style={S.tcL}><Text style={S.tabHL}>APPL</Text></View>
          <View style={S.tcN}><Text style={S.tabHL}>NAME</Text></View>
          <View style={S.tcNa}><Text style={S.tabHL}>NATIONALITY</Text></View>
          <View style={S.tcI}><Text style={S.tabHL}>INCOME (SHARE)</Text></View>
          <View style={S.tcV}><Text style={S.tabHL}>VERIFICATION</Text></View>
          <View style={S.tcB}><Text style={S.tabHL}>BUREAUS</Text></View>
          <View style={S.tcNw}><Text style={S.tabHL}>NETWORK</Text></View>
        </View>
        {applicants.map((e, i) => (
          <OperationalRow key={e.label} entry={e} idx={i} isLast={i === applicants.length - 1} />
        ))}
      </View>
    </View>
  )
}
