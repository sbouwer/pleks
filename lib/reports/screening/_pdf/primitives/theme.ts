/**
 * lib/reports/screening/_pdf/primitives/theme.ts — Design tokens for editorial FitScore PDF rebuild
 *
 * Notes: Color tokens translated from FitScore Report.html (oklch → hex; react-pdf has no oklch support).
 *        Raw colours appear ONLY in this file — all primitives reference C.* tokens only.
 *        Fonts, utility functions, and data types re-exported from _primitives/theme to avoid
 *        duplicate Font.register() calls when both theme files are loaded in the same render.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { StyleSheet } from "@react-pdf/renderer"
import type { FitScoreBand } from "@/lib/screening/fitScoreEngine.v1"
import { FONTS } from "../../_primitives/theme"

// ─── Re-export shared contract from the original theme ───────────────────────
// Font.register() lives there and runs once at import time.

export {
  FONTS,
  BAND_LABELS,
  GRADE_LABELS,
  DOCTRINE_DISCLAIMER,
  sp,
  fmtZAR,
  fmtDate,
  fmtShortDate,
  fmtTime,
} from "../../_primitives/theme"

export type {
  FitScoreReportData,
  FitScoreApplicantEntry,
  ApplicantEmployment,
  FitScoreBand,
  ConfidenceGrade,
  VerificationIntegrityGrade,
  MaterialFlag,
  NarrativeResponse,
  ExpenditureItem,
  FitScoreFinancialAnalysis,
  BureauEntry,
  VerificationOutcome,
  VerificationCheckItem,
  FitScoreCreditAnalysis,
} from "../../_primitives/theme"

// ─── Raw colour values (oklch → hex approximation) ───────────────────────────

const RAW = {
  // Surfaces
  paper:       '#faf9f5',  // oklch(0.985 0.004 85)
  paperRaised: '#ffffff',  // oklch(1 0 0)
  paperSunk:   '#f5f4ef',  // oklch(0.965 0.008 85)
  paperDeeper: '#eeede7',  // oklch(0.945 0.01 85)

  // Ink scale (blue-grey)
  ink:         '#1c1f2e',  // oklch(0.18 0.012 260)
  inkSoft:     '#3e4260',  // oklch(0.36 0.012 260)
  inkMute:     '#737699',  // oklch(0.52 0.01 260)
  inkFaint:    '#a8aabf',  // oklch(0.68 0.008 260)
  inkGhost:    '#cecfd9',  // oklch(0.82 0.005 260)

  // Rules
  rule:        '#dddbd5',  // oklch(0.88 0.006 85)
  ruleStrong:  '#c7c4bc',  // oklch(0.78 0.008 85)

  // Brand amber — focus / current state / audit marks; NOT "approved"
  amber:       '#d4820d',  // oklch(0.68 0.14 65)
  amberInk:    '#8b5200',  // oklch(0.50 0.13 55)
  amberWash:   '#fdf5eb',  // oklch(0.95 0.04 75)

  // Data — muted banking blue for evidence visualisations
  data:        '#3d5a8a',  // oklch(0.46 0.06 240)
  dataSoft:    '#8aabcc',  // oklch(0.72 0.04 240)
  dataWash:    '#eef2f7',  // oklch(0.96 0.012 240)

  // Band text + background pairs
  bandVS: '#1a5c3a', bandVSbg: '#dcfce7',
  bandSP: '#166534', bandSPbg: '#d1fae5',
  bandCR: '#92400e', bandCRbg: '#fef9c3',
  bandLC: '#c2410c', bandLCbg: '#ffedd5',
  bandAS: '#b91c1c', bandASbg: '#fee2e2',
  bandLD: '#374151', bandLDbg: '#f3f4f6',
  bandBL: '#7f1d1d', bandBLbg: '#fde8e8',
}

// ─── Semantic colour tokens ───────────────────────────────────────────────────

export const C = {
  surface: {
    paper:       RAW.paper,
    paperRaised: RAW.paperRaised,
    paperSunk:   RAW.paperSunk,
    paperDeeper: RAW.paperDeeper,
  },
  ink: {
    primary: RAW.ink,
    soft:    RAW.inkSoft,
    mute:    RAW.inkMute,
    faint:   RAW.inkFaint,
    ghost:   RAW.inkGhost,
  },
  rule: {
    base:   RAW.rule,
    strong: RAW.ruleStrong,
  },
  amber: {
    base: RAW.amber,
    ink:  RAW.amberInk,
    wash: RAW.amberWash,
  },
  data: {
    base: RAW.data,
    soft: RAW.dataSoft,
    wash: RAW.dataWash,
  },
  band: {
    verified_stability:   { text: RAW.bandVS, bg: RAW.bandVSbg },
    stable_profile:       { text: RAW.bandSP, bg: RAW.bandSPbg },
    cautious_review:      { text: RAW.bandCR, bg: RAW.bandCRbg },
    limited_confidence:   { text: RAW.bandLC, bg: RAW.bandLCbg },
    adverse_signals:      { text: RAW.bandAS, bg: RAW.bandASbg },
    limited_data_profile: { text: RAW.bandLD, bg: RAW.bandLDbg },
    blocked:              { text: RAW.bandBL, bg: RAW.bandBLbg },
  } as Record<FitScoreBand, { text: string; bg: string }>,
}

// ─── Typography base styles ───────────────────────────────────────────────────
// letterSpacing in pt (0.14em at 8pt ≈ 1.1pt → 1.0; 0.06em at 8pt ≈ 0.5pt → 0.5)

export const T = StyleSheet.create({
  h2:     { fontSize: 16, fontFamily: FONTS.sans, fontWeight: 500,    color: RAW.ink,     letterSpacing: -0.3, lineHeight: 1.2  },
  h3:     { fontSize: 11, fontFamily: FONTS.sans, fontWeight: 500,    color: RAW.ink,     letterSpacing: -0.1, lineHeight: 1.25 },
  body:   { fontSize: 9.5, fontFamily: FONTS.sans,                    color: RAW.ink,     lineHeight: 1.55 },
  soft:   { fontSize: 9.5, fontFamily: FONTS.sans,                    color: RAW.inkSoft, lineHeight: 1.55 },
  mono:   { fontSize: 8,   fontFamily: FONTS.mono,                    color: RAW.inkMute, letterSpacing: 1 },
  monoSm: { fontSize: 7.5, fontFamily: FONTS.mono,                    color: RAW.inkFaint, letterSpacing: 0.5 },
  label:  { fontSize: 7.5, fontFamily: FONTS.mono,                    color: RAW.inkMute, letterSpacing: 1, textTransform: 'uppercase' },
  row:    { flexDirection: 'row' as const },
  divider:{ borderBottomWidth: 0.75, borderBottomColor: RAW.rule },
})

// ─── Density tokens ───────────────────────────────────────────────────────────
// Central spacing and sizing constants. All primitives reference D.* for layout.
// A single retune here propagates to every primitive.

export const D = {
  pagePaddingX:       44,
  pagePaddingY:       36,
  primitiveGap:       12,
  primitiveGapTight:  8,
  cardPaddingY:       8,
  cardPaddingX:       14,
  h1Size:             22,
  bodyLineHeight:     1.45,
  footerLineHeight:   1.35,
  bandLadderRungSize: 25,
} as const

// ─── Page geometry ────────────────────────────────────────────────────────────
// A4 at 595×842pt.

export const PAGE = {
  paddingTop:        D.pagePaddingY,
  paddingBottom:     58,
  paddingHorizontal: D.pagePaddingX,
  size: 'A4' as const,
}
