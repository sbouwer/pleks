/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail/interpretive/ApplicantDetailInterpretive.tsx
 *
 * §1 ApplicantDetail — Interpretive mode (N=2). Four-zone composition: Header / Context rail /
 * Verification body / Signal strip. Vertical-within-applicant reading; full evidentiary depth
 * per applicant. Framing surface: C.surface.paperSunk on card header strip.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.3/§4.4/§10.3; see doctrine.md co-located.
 */
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "../../theme"
import type { FitScoreApplicantEntry } from "../../theme"

// ─── ID / network / bureau helpers ────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${sp(e.nationalityStatus)}`
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  if (e.sex)            parts.push(e.sex)
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
  return parts.join(' · ')
}

function networkFull(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === 'trusted') return `${e.pleksNetworkTenancyCount} trusted tenancy`
  if (e.pleksNetworkStatus === 'adverse') return 'Adverse record'
  return 'None on record'
}

function bureauFull(e: FitScoreApplicantEntry): string {
  return e.respondingBureaus.length > 0 ? e.respondingBureaus.join(', ') : 'None'
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
  card:     { borderWidth: 0.75, borderColor: C.rule.base, marginBottom: D.primitiveGap },
  cardLast: { marginBottom: 0 },
  cHead: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
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
  cName: {
    fontFamily:    FONTS.sans,
    fontSize:      12,
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
  fSub: {
    fontFamily: FONTS.sans,
    fontSize:   7.5,
    color:      C.ink.mute,
    marginTop:  2,
    lineHeight: 1.4,
  },
})

// ─── Field atom ───────────────────────────────────────────────────────────────

function F({ label, val, sub, muted = false, isLast = false }: Readonly<{
  label:  string
  val:    string
  sub?:   string
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

// ─── Per-applicant card ───────────────────────────────────────────────────────

function InterpretiveCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLast ? [S.card, S.cardLast] : S.card} wrap={false}>
      {/* Zone 1 — Header */}
      <View style={S.cHead}>
        <Text style={S.badge}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cName}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      {/* Zone 2 (context rail) + Zone 3 (verification body) — two-column body */}
      <View style={S.cBody}>
        <View style={S.cCol}>
          <F label="Identity" val={idLine(entry)} />
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
      {/* Zone 4 — Signal strip (per-applicant flags; reserved — no per-applicant flag type yet) */}
    </View>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailInterpretiveProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailInterpretive({ applicants }: Readonly<ApplicantDetailInterpretiveProps>) {
  return (
    <View style={S.wrap}>
      <Text style={S.secLabel}>APPLICANT DETAIL</Text>
      <Text style={S.secSub}>Participant context for all parties to this lease.</Text>
      {applicants.map((e, i) => (
        <InterpretiveCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
      ))}
    </View>
  )
}
