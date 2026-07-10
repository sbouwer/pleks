/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail/summary/ApplicantDetailSummary.tsx
 *
 * §1 ApplicantDetail — Summary mode (N=3). Compact header; narrow vertical rail
 * visually subordinated; household-first reading posture. No job title; bureau count
 * (not full names). Framing surface: C.surface.paperSunk on card header strip.
 * Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.4/§10.3; see doctrine.md co-located.
 */
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "../../theme"
import type { FitScoreApplicantEntry } from "../../theme"

// ─── ID / network / bureau helpers ────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${sp(e.nationalityStatus)}`
  const parts: string[] = ['ID']
  if (e.idNumberMasked) parts.push(sp(e.idNumberMasked.replaceAll('•', '*')))
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
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
  outerCard: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
  },
  outerHead: {
    paddingVertical:   D.cardPaddingY,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  outerL1: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  3,
  },
  outerL2: {
    fontFamily:   FONTS.sans,
    fontSize:     12,
    fontWeight:   'bold',
    color:        C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:   1.25,
    marginBottom: 2,
  },
  outerL3: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    color:         C.ink.mute,
    letterSpacing: 0.2,
  },
  outerBody: { padding: D.cardPaddingX },
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
  cBody: {
    flexDirection:     'row',
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
    gap:               16,
  },
  cColNarrow: { flex: 0.55 },   // narrow rail — identity only, visually subordinated
  cCol:       { flex: 1 },
  cColWide:   { flex: 1.2 },
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

// ─── Per-applicant card (three-column body, narrow rail) ──────────────────────

function SummaryCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>) {
  const emp = entry.employment
  return (
    <View style={isLast ? [S.card, S.cardLast] : S.card} wrap={false}>
      {/* Zone 1 — Compact header */}
      <View style={S.cHead}>
        <Text style={S.badge}>{entry.label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={S.cName}>{sp(entry.fullName)}</Text>
          <Text style={S.cNat}>{sp(entry.nationalityStatus)}</Text>
        </View>
      </View>
      {/* Zone 2 (narrow rail) + Zone 3 (verification body) — three-column body */}
      <View style={S.cBody}>
        <View style={S.cColNarrow}>
          {/* Narrow rail: identity only — subordinated by narrower flex width */}
          <F label="Identity" val={idLine(entry)} isLast />
        </View>
        <View style={S.cCol}>
          {/* Employment — no job title in summary mode */}
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
          {/* Household metrics: count-first */}
          <F label="Income"       val={`${fmtZAR(entry.verifiedIncomeCents)} (${entry.incomeSharePct}%)`} />
          <F label="Verification" val={`${entry.verificationPassCount} of ${entry.verificationTotal}`} />
          <F label="Bureaus"      val={bureauCount(entry)} />
          <F label="Network"      val={networkCompact(entry)} isLast muted={entry.pleksNetworkStatus === 'none'} />
        </View>
      </View>
      {/* Zone 4 — Signal strip (per-applicant flags; reserved) */}
    </View>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailSummaryProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailSummary({ applicants }: Readonly<ApplicantDetailSummaryProps>) {
  const n = applicants.length
  const first = applicants[0]
  const surname = first.fullName.split(/\s+/).at(-1) ?? first.fullName
  const l1 = n === 1 ? 'APPLICANT' : 'APPLICANTS'
  const l2 = n === 1 ? sp(first.fullName) : `${sp(surname)} + ${n - 1}`
  const l3 = n === 1 ? idLine(first) : 'Joint application'
  return (
    <View style={S.wrap}>
      <View style={S.outerCard} wrap={false}>
        <View style={S.outerHead}>
          <Text style={S.outerL1}>{l1}</Text>
          <Text style={S.outerL2}>{l2}</Text>
          <Text style={S.outerL3}>{l3}</Text>
        </View>
        <View style={S.outerBody}>
          {applicants.map((e, i) => (
            <SummaryCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
          ))}
        </View>
      </View>
    </View>
  )
}
