/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail/comparative/ApplicantDetailComparative.tsx
 *
 * §1 ApplicantDetail — Comparative mode (N=4). 2×2 card grid; horizontal-across-applicants
 * reading direction. Context rail dissolved into comparison rows inside each card.
 * Zone 4 = Flag row (aggregate across all cards). Framing: C.surface.paperSunk on card heads.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.4/§10.3; see doctrine.md co-located.
 */
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "../../theme"
import type { FitScoreApplicantEntry } from "../../theme"

// ─── ID / network / bureau helpers ────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return 'Passport'
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  return parts.join(' · ')
}

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
  // 2×2 comparative grid
  cgWrap: { borderWidth: 0.75, borderColor: C.rule.base, marginBottom: D.primitiveGap },
  cgRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  cgRowLast:    { borderBottomWidth: 0 },
  cgCard:       { flex: 1, borderRightWidth: 0.75, borderRightColor: C.rule.base },
  cgCardLast:   { borderRightWidth: 0 },
  cgCardHead: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   D.cardPaddingY - 2,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    backgroundColor:   C.surface.paperSunk,
  },
  cgCardBody: {
    paddingVertical:   D.cardPaddingY,
    paddingHorizontal: D.cardPaddingX,
  },
  badge: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    fontWeight:    'bold',
    color:         C.ink.soft,
    letterSpacing: 0.5,
    minWidth:      16,
  },
  cName: {
    fontFamily:    FONTS.sans,
    fontSize:      10,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
  },
  cNat: {
    fontFamily: FONTS.sans,
    fontSize:   7.5,
    color:      C.ink.mute,
    marginTop:  2,
  },
  fWrap:     { marginBottom: 8 },
  fWrapLast: { marginBottom: 0 },
  fLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  2,
  },
  fValue: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    color:         C.ink.primary,
    letterSpacing: 0.2,
    lineHeight:    1.3,
  },
  fValueMuted: { color: C.ink.mute },
})

// ─── Field atom ───────────────────────────────────────────────────────────────

function F({ label, val, muted = false, isLast = false }: Readonly<{
  label:  string
  val:    string
  muted?: boolean
  isLast?: boolean
}>) {
  return (
    <View style={isLast ? S.fWrapLast : S.fWrap}>
      <Text style={S.fLabel}>{label}</Text>
      <Text style={muted ? [S.fValue, S.fValueMuted] : S.fValue}>{val}</Text>
    </View>
  )
}

// ─── Card (one applicant) ─────────────────────────────────────────────────────

function ComparativeCard({ entry, isLastInRow }: Readonly<{ entry: FitScoreApplicantEntry; isLastInRow: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLastInRow ? [S.cgCard, S.cgCardLast] : S.cgCard}>
      <View style={S.cgCardHead}>
        <Text style={S.badge}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cName}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      {/* Context rail dissolved into comparison rows */}
      <View style={S.cgCardBody}>
        <F label="Identity"     val={idLine(entry)} />
        <F label="Employer"     val={emp === null ? 'Not provided' : sp(emp.employerName)} muted={emp === null} />
        <F label="Income"       val={`${fmtZAR(entry.verifiedIncomeCents)} (${entry.incomeSharePct}%)`} />
        <F label="Verification" val={`${entry.verificationPassCount} of ${entry.verificationTotal}`} />
        <F label="Bureaus"      val={bureauCount(entry)} />
        <F label="Network"      val={networkCompact(entry)} isLast muted={entry.pleksNetworkStatus === 'none'} />
      </View>
    </View>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailComparativeProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailComparative({ applicants }: Readonly<ApplicantDetailComparativeProps>) {
  // Pair into rows of 2; wrap={false} keeps each row on one page
  const rows: FitScoreApplicantEntry[][] = []
  for (let i = 0; i < applicants.length; i += 2) {
    rows.push(applicants.slice(i, i + 2))
  }
  return (
    <View style={S.wrap}>
      <Text style={S.secLabel}>APPLICANT DETAIL</Text>
      <Text style={S.secSub}>Participant context for all parties to this lease.</Text>
      <View style={S.cgWrap}>
        {rows.map((row, rowIdx) => (
          <View
            key={row[0].label}
            style={rowIdx === rows.length - 1 ? [S.cgRow, S.cgRowLast] : S.cgRow}
            wrap={false}
          >
            {row.map((e, cardIdx) => (
              <ComparativeCard key={e.label} entry={e} isLastInRow={cardIdx === row.length - 1} />
            ))}
          </View>
        ))}
      </View>
      {/* Zone 4 — Flag row (aggregate across all applicants; reserved) */}
    </View>
  )
}
