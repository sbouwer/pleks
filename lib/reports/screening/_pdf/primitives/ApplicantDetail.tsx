/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail.tsx
 *
 * §1 editorial chrome — density-tiered participant detail for multi-applicant leases.
 * Unnumbered editorial surface (DOCTRINE.md). Dispatches to Rich (N=2) / Medium (N=3)
 * / Compact (N=4) / Tabular (N>=5) sub-layouts based on applicant count.
 * Returns null when applicants.length < 2. Natural page overflow for all tiers.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.7, §6.10.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "./theme"
import type { FitScoreApplicantEntry } from "./theme"

// ─── Density dispatch ─────────────────────────────────────────────────────────

type ApplicantDetailDensity = 'rich' | 'medium' | 'compact' | 'tabular'

function densityFor(n: number): ApplicantDetailDensity {
  if (n === 2) return 'rich'
  if (n === 3) return 'medium'
  if (n === 4) return 'compact'
  return 'tabular'
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function idLineRich(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${sp(e.nationalityStatus)}`
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  if (e.sex)            parts.push(e.sex)
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
  return parts.join(' · ')
}

function idLineMedium(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${sp(e.nationalityStatus)}`
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
  return parts.join(' · ')
}

function idLineCompact(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return 'Passport'
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  return parts.join(' · ')
}

function networkFull(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === 'trusted') return `${e.pleksNetworkTenancyCount} trusted tenancy`
  if (e.pleksNetworkStatus === 'adverse') return 'Adverse record'
  return 'None on record'
}

function networkCompact(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === 'trusted') return `${e.pleksNetworkTenancyCount} trusted`
  if (e.pleksNetworkStatus === 'adverse') return 'Adverse'
  return 'None'
}

function bureauFull(e: FitScoreApplicantEntry): string {
  return e.respondingBureaus.length > 0 ? e.respondingBureaus.join(', ') : 'None'
}

function bureauCount(e: FitScoreApplicantEntry): string {
  const n = e.respondingBureaus.length
  if (n === 0) return 'None'
  return `${n} bureau${n === 1 ? '' : 's'}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },

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

  // Card chrome (rich / medium)
  card: {
    borderWidth:  0.75,
    borderColor:  C.rule.base,
    marginBottom: D.primitiveGap,
  },
  cardLast: { marginBottom: 0 },

  cHead: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    paddingVertical:   D.cardPaddingY,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    backgroundColor:   C.surface.paperSunk,
  },
  badge: {
    fontFamily:    FONTS.mono,
    fontSize:      11,
    fontWeight:    'bold',
    color:         C.ink.soft,
    letterSpacing: 0.5,
    minWidth:      18,
  },
  badgeSm: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    fontWeight:    'bold',
    color:         C.ink.soft,
    letterSpacing: 0.5,
    minWidth:      16,
  },
  cName: {
    fontFamily:    FONTS.sans,
    fontSize:      12,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
  },
  cNameSm: {
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

  cBody: {
    flexDirection:     'row',
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
    gap:               16,
  },
  cCol:     { flex: 1 },
  cColWide: { flex: 1.2 },

  // Field
  fWrap:      { marginBottom: 8 },
  fWrapLast:  { marginBottom: 0 },
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
  fSub: {
    fontFamily: FONTS.sans,
    fontSize:   7.5,
    color:      C.ink.mute,
    marginTop:  2,
    lineHeight: 1.4,
  },

  // Compact grid (2x2) — outer border + row pairs, each row wrap={false}
  cgWrap: {
    borderWidth:  0.75,
    borderColor:  C.rule.base,
    marginBottom: D.primitiveGap,
  },
  cgRow: {
    flexDirection:     'row',
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  cgRowLast: { borderBottomWidth: 0 },
  cgCard: {
    flex:             1,
    borderRightWidth: 0.75,
    borderRightColor: C.rule.base,
  },
  cgCardLast: { borderRightWidth: 0 },
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

  // Tabular (N>=5)
  tabWrap: {
    borderWidth: 0.75,
    borderColor: C.rule.base,
    marginBottom: D.primitiveGap,
  },
  tabHead: {
    flexDirection:    'row',
    paddingVertical:   7,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.strong,
    backgroundColor:   C.surface.paperSunk,
  },
  tabRow: {
    flexDirection:     'row',
    paddingVertical:   8,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  tabRowAlt:  { backgroundColor: C.surface.paperSunk },
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

  // Tabular column widths
  tcL:  { flex: 0.5 },
  tcN:  { flex: 1.4 },
  tcNa: { flex: 1.2 },
  tcI:  { flex: 1.1 },
  tcV:  { flex: 0.8 },
  tcB:  { flex: 0.8 },
  tcNw: { flex: 0.9 },
})

// ─── Field component ──────────────────────────────────────────────────────────

function F({ label, val, sub, muted = false, isLast = false }: Readonly<{
  label: string
  val:   string
  sub?:  string
  muted?: boolean
  isLast?: boolean
}>) {
  return (
    <View style={isLast ? S.fWrapLast : S.fWrap}>
      <Text style={S.fLabel}>{label}</Text>
      <Text style={muted ? [S.fValue, S.fValueMuted] : S.fValue}>{val}</Text>
      {sub !== undefined && <Text style={S.fSub}>{sub}</Text>}
    </View>
  )
}

// ─── Rich layout (N=2) ────────────────────────────────────────────────────────

function RichCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLast ? [S.card, S.cardLast] : S.card} wrap={false}>
      <View style={S.cHead}>
        <Text style={S.badge}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cName}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      <View style={S.cBody}>
        <View style={S.cCol}>
          <F label="Identity" val={idLineRich(entry)} />
          {emp === null
            ? <F label="Employment" val="Not provided" muted isLast />
            : (
              <View>
                <F label="Employer"  val={sp(emp.employerName)} />
                <F label="Job title" val={sp(emp.jobTitle)} />
                <F label="Tenure"    val={sp(emp.tenureDisplay)} isLast />
              </View>
            )
          }
        </View>
        <View style={S.cCol}>
          <F label="Verified income" val={fmtZAR(entry.verifiedIncomeCents)} sub={`${entry.incomeSharePct}% of joint income`} />
          <F label="Verification"    val={`${entry.verificationPassCount} of ${entry.verificationTotal} checks`} />
          <F label="Bureau coverage" val={bureauFull(entry)} />
          <F label="Pleks network"   val={networkFull(entry)} isLast />
        </View>
      </View>
    </View>
  )
}

function RichLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>) {
  return (
    <View>
      {applicants.map((e, i) => (
        <RichCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
      ))}
    </View>
  )
}

// ─── Medium layout (N=3) ─────────────────────────────────────────────────────

function MediumCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLast ? [S.card, S.cardLast] : S.card} wrap={false}>
      <View style={S.cHead}>
        <Text style={S.badge}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cNameSm}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      <View style={S.cBody}>
        <View style={S.cCol}>
          <F label="Identity" val={idLineMedium(entry)} isLast />
        </View>
        <View style={S.cCol}>
          {emp === null
            ? <F label="Employment" val="Not provided" muted isLast />
            : (
              <View>
                <F label="Employer" val={sp(emp.employerName)} />
                <F label="Tenure"   val={sp(emp.tenureDisplay)} isLast />
              </View>
            )
          }
        </View>
        <View style={S.cColWide}>
          <F label="Income"       val={`${fmtZAR(entry.verifiedIncomeCents)} (${entry.incomeSharePct}%)`} />
          <F label="Verification" val={`${entry.verificationPassCount} of ${entry.verificationTotal}`} />
          <F label="Bureaus"      val={bureauCount(entry)} />
          <F label="Network"      val={networkCompact(entry)} isLast muted={entry.pleksNetworkStatus === 'none'} />
        </View>
      </View>
    </View>
  )
}

function MediumLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>) {
  return (
    <View>
      {applicants.map((e, i) => (
        <MediumCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
      ))}
    </View>
  )
}

// ─── Compact layout (N=4) ────────────────────────────────────────────────────

function CompactCard({ entry, isLastInRow }: Readonly<{ entry: FitScoreApplicantEntry; isLastInRow: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLastInRow ? [S.cgCard, S.cgCardLast] : S.cgCard}>
      <View style={S.cgCardHead}>
        <Text style={S.badgeSm}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cNameSm}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      <View style={S.cgCardBody}>
        <F label="Identity"     val={idLineCompact(entry)} />
        <F label="Employer"     val={emp === null ? 'Not provided' : sp(emp.employerName)} muted={emp === null} />
        <F label="Income"       val={`${fmtZAR(entry.verifiedIncomeCents)} (${entry.incomeSharePct}%)`} />
        <F label="Verification" val={`${entry.verificationPassCount} of ${entry.verificationTotal}`} />
        <F label="Bureaus"      val={bureauCount(entry)} />
        <F label="Network"      val={networkCompact(entry)} isLast muted={entry.pleksNetworkStatus === 'none'} />
      </View>
    </View>
  )
}

function CompactLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>) {
  // Pair applicants into rows of 2; wrap={false} keeps each row on one page
  const rows: FitScoreApplicantEntry[][] = []
  for (let i = 0; i < applicants.length; i += 2) {
    rows.push(applicants.slice(i, i + 2))
  }
  return (
    <View style={S.cgWrap}>
      {rows.map((row, rowIdx) => (
        <View key={row[0].label} style={rowIdx === rows.length - 1 ? [S.cgRow, S.cgRowLast] : S.cgRow} wrap={false}>
          {row.map((e, cardIdx) => (
            <CompactCard key={e.label} entry={e} isLastInRow={cardIdx === row.length - 1} />
          ))}
        </View>
      ))}
    </View>
  )
}

// ─── Tabular layout (N>=5) — natural page overflow ────────────────────────────

function TabRow({ entry, idx, isLast }: Readonly<{ entry: FitScoreApplicantEntry; idx: number; isLast: boolean }>) {
  const isAlt = idx % 2 === 1
  const netStyle = entry.pleksNetworkStatus === 'none' ? [S.tabV, S.tabVMute] : S.tabV
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
      <View style={S.tcNw}><Text style={netStyle}>{networkCompact(entry)}</Text></View>
    </View>
  )
}

function TabularLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>) {
  return (
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
        <TabRow key={e.label} entry={e} idx={i} isLast={i === applicants.length - 1} />
      ))}
    </View>
  )
}

// ─── Layout dispatcher ────────────────────────────────────────────────────────

function ApplicantLayout({ density, applicants }: Readonly<{
  density:    ApplicantDetailDensity
  applicants: FitScoreApplicantEntry[]
}>) {
  if (density === 'rich')    return <RichLayout    applicants={applicants} />
  if (density === 'medium')  return <MediumLayout  applicants={applicants} />
  if (density === 'compact') return <CompactLayout applicants={applicants} />
  return <TabularLayout applicants={applicants} />
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetail({ applicants }: Readonly<ApplicantDetailProps>) {
  if (applicants.length < 2) return null
  const density = densityFor(applicants.length)
  return (
    <View style={S.wrap}>
      <Text style={S.secLabel}>APPLICANT DETAIL</Text>
      <Text style={S.secSub}>Participant context for all parties to this lease.</Text>
      <ApplicantLayout density={density} applicants={applicants} />
    </View>
  )
}
