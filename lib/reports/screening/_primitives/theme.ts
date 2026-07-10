/**
 * lib/reports/screening/_primitives/theme.ts — Design tokens, shared types, and utilities for FitScore Stream 2 PDFs
 *
 * Notes: CSS variable palette from FitScore Report.html design reference, translated to @react-pdf/renderer.
 *        Semantic colour tokens per ADDENDUM_14H_FITSCORE_DELIVERY.md §10.6 (Review #4).
 *        Raw colour values appear ONLY in this file — all primitives and templates reference tokens.
 *        Also exports FitScoreReportData and FitScoreApplicantEntry (the template prop contract).
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.2, §10.6.
 */

import { Font, StyleSheet } from "@react-pdf/renderer"
import path from "node:path"

// ─── Font registration ────────────────────────────────────────────────────────
// In Next.js / Vercel (default): fonts fetched via HTTP URL from the app origin.
// In render scripts: set FITSCORE_FONT_SOURCE=local (via cross-env in npm script)
// to load fonts from the local public/ directory using fontkit.open() — no dev
// server needed. Bare paths (not file:// URLs) bypass fetch and go straight to
// fontkit.open(), which reads the file directly.
// Font.register() is idempotent — first call wins — so FITSCORE_FONT_SOURCE must
// be set at process start (before tsx loads any module). Use the npm scripts.

function fontSrc(filename: string): string {
  if (process.env.FITSCORE_FONT_SOURCE === 'local') {
    return path.resolve(process.cwd(), 'public', 'fonts', filename)
  }
  return `${APP_URL}/fonts/${filename}`
}

Font.register({
  family: 'Inter Tight',
  fonts: [
    { src: fontSrc('InterTight-Regular.ttf'), fontWeight: 'normal' },
    { src: fontSrc('InterTight-Bold.ttf'),    fontWeight: 'bold'   },
  ],
})

Font.register({
  family: 'JetBrains Mono',
  fonts: [
    { src: fontSrc('JetBrainsMono-Regular.ttf'), fontWeight: 'normal' },
  ],
})

export const FONTS = {
  sans: 'Inter Tight',
  mono: 'JetBrains Mono',
} as const
import type {
  FitScoreBand,
  ConfidenceGrade,
  VerificationIntegrityGrade,
  MaterialFlag,
} from "@/lib/screening/fitScoreEngine.v1"
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import { fmtZA } from "@/lib/dates"
import { APP_URL } from "@/lib/env"

// ─── Re-export engine types used across all primitives ────────────────────────

export type {
  FitScoreBand,
  ConfidenceGrade,
  VerificationIntegrityGrade,
  MaterialFlag,
  NarrativeResponse,
}

// ─── Shared data contract ─────────────────────────────────────────────────────

export interface ApplicantEmployment {
  employerName: string
  jobTitle: string
  tenureDisplay: string             // e.g. '4y 7mo'
}

export interface FitScoreApplicantEntry {
  label: string                     // 'Applicant A', 'Applicant B', …
  fullName: string
  nationalityStatus: string         // e.g. 'SA Citizen', 'Foreign National (work permit, expires 2027-08-15)'
  idNumberMasked: string            // e.g. '8807•••••091' (SA ID) or 'M••••••3' (passport)
  sex: 'M' | 'F' | null            // derived from SA ID digit 7; null for foreign nationals
  ageYears: number | null           // derived from SA ID YYMMDD prefix; null for foreign nationals
  employment: ApplicantEmployment | null
  verifiedIncomeCents: number
  incomeSharePct: number            // 0–100
  verificationPassCount: number
  verificationTotal: number
  respondingBureaus: string[]       // named bureaus e.g. ['TransUnion', 'VeriCred', 'Sigma']
  pleksNetworkStatus: 'trusted' | 'adverse' | 'none'
  pleksNetworkTenancyCount: number
  isForeignNational: boolean
}

export interface FitScoreReportData {
  // Lease identity
  applicationRef: string            // display-safe short ref
  unitLabel: string                 // e.g. '2-bedroom apartment, Sea Point, Cape Town'
  generatedAt: string               // ISO datetime
  submittedAt: string               // ISO datetime — when applicant submitted

  // Applicants
  primaryApplicantName: string
  coApplicantCount: number
  applicants: FitScoreApplicantEntry[]

  // Lease details
  leaseIntent: {
    termMonths: number
    monthlyRentCents: number
    depositMultiplier: number
  }

  // Engine outputs
  band: FitScoreBand
  score: number | null              // null for LDP / Blocked
  confidenceIndex: ConfidenceGrade
  verificationIntegrity: VerificationIntegrityGrade
  dimensionalScores: {
    affordability: number | null            // null when LDP and dimension unscored
    stability: number | null               // null when LDP and dimension unscored
    creditBehaviour: number | null         // null for foreign-national-only lease or LDP
    verificationIntegrity: number | null   // null when LDP and dimension unscored
    // Engine-emitted thresholds; v1.0: static lookup in getPreferredThresholds(). v1.1+ derives Stability per-case.
    affordability_preferred_threshold: number
    stability_preferred_threshold: number
    creditBehaviour_preferred_threshold: number | null  // null for all-foreign-national lease
    verificationIntegrity_preferred_threshold: number
  }
  materialFlags: MaterialFlag[]
  isLdp: boolean
  isAllForeignNational: boolean

  // Narrative (may be templated fallback)
  narrative: NarrativeResponse

  // Versioning metadata
  engineVersion: string
  narrativeVersion: string
  interpretationVersion: string
  synthesisVersion: string
  inputsHash: string                // full SHA-256; first 8 chars shown in footer

  // Org branding
  orgName: string
  orgFfcNumber: string | null       // PPRA FFC number; null until org has entered it

  // Per-dimension editorial stats (F13 — orchestrator-computed)
  dimensions: {
    affordability: {
      rentToIncomePct: number
      windowMonths: number
    }
    stability: {
      currentTenureDisplay: string  // e.g. '4y 7mo'
      employersIn7Years: number
    }
    credit: {
      bureauCoverageDisplay: string // e.g. '2 / 3'
      divergencePoints: number | null
    }
    verification: {
      checksPassedDisplay: string   // e.g. '5 / 5'
      manualOverridesPending: number
      auditEntriesCount: number
    }
  }

  // Extended analysis pages (E.3)
  financialAnalysis?: FitScoreFinancialAnalysis
  creditAnalysis?: FitScoreCreditAnalysis
}

// ─── Financial analysis types ─────────────────────────────────────────────────

export interface ExpenditureItem {
  category: string
  tagSource: string
  monthlyAvgCents: number
  incomeSharePct: number
}

export interface FitScoreFinancialAnalysis {
  windowLabel: string
  declaredIncomeCents: number
  observedInflowsCents: number
  verifiedBaselineCents: number
  variancePct: number                // negative = declared > verified
  evidenceTierLabel: string
  expenditures: ExpenditureItem[]
  totalOutflowsCents: number
  disposableCents: number
  proposedRentCents: number
  proposedRentPct: number
  disposableAfterRentCents: number
}

// ─── Credit analysis types ────────────────────────────────────────────────────

export interface BureauEntry {
  name: string
  subLabel: string
  coveragePips: number               // 0-5 filled squares
  coverageLabel: string
  tradeLines: string
  adverseListings: string
  reportedScore: number | null       // null = no response
}

export type VerificationOutcome = 'pass' | 'partial' | 'absent'

export interface VerificationCheckItem {
  checkName: string
  checkSub: string
  source: string
  method: string
  outcomeType: VerificationOutcome
  outcomeLabel: string
  evidenceNote: string
}

export interface FitScoreCreditAnalysis {
  bureausSolicited: number
  bureausResponding: number
  bureauEntries: BureauEntry[]
  verificationsLabel: string
  verificationsQueryLabel: string
  verificationChecks: VerificationCheckItem[]
}

// ─── Raw colour values (do NOT reference directly outside this file) ──────────

const RAW = {
  paper:     '#ffffff',
  paperSoft: '#f7f6f2',
  ink:       '#1a1a1a',
  inkSoft:   '#4a4a4a',
  inkFaint:  '#888888',
  amber:     '#b45309',
  divider:   '#e5e3dc',

  // Band foreground (text label colour)
  bandVS:   '#1a5c3a',
  bandSP:   '#166534',
  bandCR:   '#92400e',
  bandLC:   '#c2410c',
  bandAS:   '#b91c1c',
  bandLD:   '#374151',
  bandBL:   '#7f1d1d',

  // Band background tints
  bandVSbg: '#dcfce7',
  bandSPbg: '#d1fae5',
  bandCRbg: '#fef9c3',
  bandLCbg: '#ffedd5',
  bandASbg: '#fee2e2',
  bandLDbg: '#f3f4f6',
  bandBLbg: '#fde8e8',

  // Flag borders
  flagCritical: '#b91c1c',
  flagCapping:  '#6b7280',
  flagTrust:    '#1a5c3a',

  // Flag backgrounds
  flagCriticalBg: '#fef2f2',
  flagCappingBg:  '#f9f9f8',
  flagTrustBg:    '#f0fdf4',
}

// ─── Semantic colour tokens ───────────────────────────────────────────────────

export const colors = {
  brand: {
    primary: RAW.ink,
    accent:  RAW.amber,
  },
  surface: {
    paper:     RAW.paper,
    paperSoft: RAW.paperSoft,
    divider:   RAW.divider,
  },
  text: {
    primary: RAW.ink,
    soft:    RAW.inkSoft,
    faint:   RAW.inkFaint,
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
  flag: {
    critical: { border: RAW.flagCritical, bg: RAW.flagCriticalBg },
    capping:  { border: RAW.flagCapping,  bg: RAW.flagCappingBg },
    trust:    { border: RAW.flagTrust,    bg: RAW.flagTrustBg },
  } as Record<string, { border: string; bg: string }>,
}

// ─── Band and grade display names ─────────────────────────────────────────────

export const BAND_LABELS: Record<FitScoreBand, string> = {
  verified_stability:   'Verified Stability',
  stable_profile:       'Stable Profile',
  cautious_review:      'Cautious Review',
  limited_confidence:   'Limited Confidence',
  adverse_signals:      'Adverse Signals',
  limited_data_profile: 'Limited Data Profile',
  blocked:              'Blocked',
}

export const GRADE_LABELS: Record<string, string> = {
  high:         'High',
  medium:       'Medium',
  low:          'Low',
  insufficient: 'Insufficient',
  limited:      'Limited',
}

// ─── Shared typography base styles ────────────────────────────────────────────

export const T = StyleSheet.create({
  h2:      { fontSize: 11, fontFamily: FONTS.sans, fontWeight: 'bold',   color: RAW.ink, marginBottom: 4, marginTop: 10 },
  h3:      { fontSize: 9,  fontFamily: FONTS.sans, fontWeight: 'bold',   color: RAW.ink, marginBottom: 3, marginTop: 8 },
  body:    { fontSize: 9,  fontFamily: FONTS.sans,                        color: RAW.ink, lineHeight: 1.5 },
  small:   { fontSize: 7.5, fontFamily: FONTS.sans,                       color: RAW.inkSoft },
  faint:   { fontSize: 7,   fontFamily: FONTS.sans,                       color: RAW.inkFaint },
  label:   { fontSize: 6.5, fontFamily: FONTS.sans, fontWeight: 'bold',   color: RAW.inkFaint, textTransform: 'uppercase' },
  row:     { flexDirection: 'row' as const },
  divider: { borderBottomWidth: 0.75, borderBottomColor: RAW.divider, marginVertical: 8 },
})

// ─── Editorial constants ──────────────────────────────────────────────────────

export const DOCTRINE_DISCLAIMER =
  'This is not an approval or rejection. It is a record of the evidence Pleks received, ' +
  'how that evidence reconciles, and where uncertainty remains. ' +
  'Final tenancy decisions rest with the agent or landlord.'

// ─── String sanitiser (Helvetica / WinAnsiEncoding safe) ──────────────────────

export function sp(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replaceAll('—', '-').replaceAll('–', '-')
    .replaceAll('‘', "'").replaceAll('’', "'")
    .replaceAll('“', '"').replaceAll('”', '"')
    .replaceAll('…', '...').replaceAll(' ', ' ')
    .replaceAll(/[^\x20-\xFF]/g, '')
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtZAR(cents: number): string {
  const rands = Math.round(Math.abs(cents) / 100)
  const formatted = rands.toLocaleString('en-ZA')
  return cents < 0 ? `-R ${formatted}` : `R ${formatted}`
}

export function fmtDate(iso: string): string {
  try {
    return fmtZA(iso, {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return sp(iso)
  }
}

export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    const h = (d.getUTCHours() + 2) % 24   // SAST = UTC+2, no DST
    const m = d.getUTCMinutes()
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export function fmtShortDate(iso: string): string {
  try {
    return fmtZA(iso, {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return sp(iso)
  }
}
