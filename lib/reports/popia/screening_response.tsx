/**
 * lib/reports/popia/screening_response.tsx — POPIA s23 access response letter PDF for FitScore
 *
 * Notes: L2 response per ADDENDUM_14H §8.4 — Pleks-derived classifications only.
 *        Does NOT include co-applicant data, internal weights, or operational metadata.
 *        Single page, letter-style layout. Rendered by lib/popia/handlers/screening.ts.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.3–§8.6.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreeningResponseData {
  responseDate: string                  // ISO date string
  applicationRef: string
  subjectName: string
  subjectEmail: string
  orgName: string
  band: string
  bandLabel: string
  score: number | null                  // null for LDP and Blocked
  isLimitedDataProfile: boolean
  isBlocked: boolean
  dominantFlags: Array<{ class: string; description: string }>
  identityVerificationResult: 'pass' | 'fail' | 'pending' | 'not_attempted'
  applicationStatus: string             // pending_review / approved / declined
  stream1DeliveryNote: string           // e.g. "delivered via email at time of screening"
  engineVersion: string
  narrativePromptVersion: string | null
  generatedAt: string                   // ISO date string (score generation date)
  interpretationVersion: string
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.pleks.co.za'

const S = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 56,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  letterhead: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 12,
  },
  letterheadTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  letterheadSub: {
    fontSize: 8.5,
    color: '#6b7280',
  },
  dateRef: {
    marginBottom: 20,
    fontSize: 9,
    color: '#374151',
  },
  salutation: {
    marginBottom: 16,
    fontSize: 9.5,
  },
  intro: {
    marginBottom: 20,
    lineHeight: 1.5,
  },
  sectionHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  rowLabel: {
    width: 160,
    color: '#6b7280',
    fontSize: 9,
  },
  rowValue: {
    flex: 1,
    fontSize: 9,
  },
  flagRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 3,
  },
  flagDot: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 0.5,
  },
  flagText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
  },
  noFlags: {
    fontSize: 9,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    marginTop: 16,
    marginBottom: 6,
  },
  body: {
    lineHeight: 1.55,
    fontSize: 9.5,
    marginBottom: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 56,
    right: 56,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7.5,
    color: '#9ca3af',
    lineHeight: 1.4,
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_LABELS: Record<string, string> = {
  verified_stability:   'Verified Stability',
  stable_profile:       'Stable Profile',
  cautious_review:      'Cautious Review',
  limited_confidence:   'Limited Confidence',
  adverse_signals:      'Adverse Signals',
  limited_data_profile: 'Limited Data Profile',
  blocked:              'Blocked',
}

const STATUS_LABELS: Record<string, string> = {
  pending_review:   'Pending review',
  approved:         'Approved',
  declined:         'Declined',
}

const ID_VERIFY_LABELS: Record<string, string> = {
  pass:          'Passed',
  fail:          'Did not pass',
  pending:       'Pending',
  not_attempted: 'Not attempted',
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScreeningResponseLetter({ data }: Readonly<{ data: ScreeningResponseData }>) {
  const bandLabel = BAND_LABELS[data.band] ?? data.bandLabel

  let scoreDisplay: string
  if (data.isLimitedDataProfile) {
    scoreDisplay = 'Not assessed (Limited Data Profile)'
  } else if (data.isBlocked) {
    scoreDisplay = 'Blocked — see material signals below'
  } else {
    scoreDisplay = data.score === null ? '—' : `${data.score}/100`
  }

  return (
    <Document
      title={`Pleks POPIA s23 Response — ${data.applicationRef}`}
      author="Pleks"
      subject="POPIA Section 23 Access Response — FitScore Screening"
    >
      <Page size="A4" style={S.page}>

        {/* Letterhead */}
        <View style={S.letterhead}>
          <Text style={S.letterheadTitle}>Pleks — POPIA Section 23 Access Response</Text>
          <Text style={S.letterheadSub}>Rental screening evidence disclosure</Text>
        </View>

        {/* Date and reference */}
        <View style={S.dateRef}>
          <Text>Date: {fmtDate(data.responseDate)}</Text>
          <Text>Application reference: {data.applicationRef}</Text>
          <Text>Agency: {data.orgName}</Text>
        </View>

        {/* Salutation */}
        <Text style={S.salutation}>Dear {data.subjectName},</Text>

        {/* Intro */}
        <Text style={S.intro}>
          This letter is provided in response to your POPIA Section 23 right of access
          request regarding your rental application referenced above. The information
          below reflects the Pleks-derived classifications produced during your screening
          assessment. Bureau credit data is addressed separately — see the bureau data
          section below.
        </Text>

        {/* FitScore classification */}
        <Text style={S.sectionHeader}>FitScore Classification</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Band classification</Text>
          <Text style={S.rowValue}>{bandLabel}</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Composite score</Text>
          <Text style={S.rowValue}>{scoreDisplay}</Text>
        </View>

        {/* Material signals (dominant flags only — class + description) */}
        <Text style={S.sectionHeader}>Material Signals</Text>
        {data.dominantFlags.length === 0 ? (
          <Text style={S.noFlags}>No material signals were recorded for this assessment.</Text>
        ) : (
          data.dominantFlags.map((f, i) => (
            <View key={i} style={S.flagRow}>
              <Text style={S.flagDot}>•</Text>
              <Text style={S.flagText}>{f.description} ({f.class})</Text>
            </View>
          ))
        )}

        {/* Identity verification */}
        <Text style={S.sectionHeader}>Identity Verification</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Verification result</Text>
          <Text style={S.rowValue}>{ID_VERIFY_LABELS[data.identityVerificationResult] ?? data.identityVerificationResult}</Text>
        </View>

        {/* Application outcome */}
        <Text style={S.sectionHeader}>Application Outcome</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Recorded status</Text>
          <Text style={S.rowValue}>{STATUS_LABELS[data.applicationStatus] ?? data.applicationStatus}</Text>
        </View>

        {/* Bureau data cross-reference (L1) */}
        <Text style={S.sectionHeader}>Bureau Credit Data (Stream 1)</Text>
        <Text style={S.body}>
          Your credit bureau report was {data.stream1DeliveryNote}. That document contains
          the bureau-sourced credit signals and is your primary right-of-access response
          for credit data held by TransUnion, VeriCred, Sigma, and XDS.
        </Text>

        {/* Engine reference metadata */}
        <Text style={S.sectionHeader}>Assessment Reference</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Generated</Text>
          <Text style={S.rowValue}>{fmtDate(data.generatedAt)}</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Engine version</Text>
          <Text style={S.rowValue}>{data.engineVersion}</Text>
        </View>
        {data.narrativePromptVersion && (
          <View style={S.row}>
            <Text style={S.rowLabel}>Narrative version</Text>
            <Text style={S.rowValue}>{data.narrativePromptVersion}</Text>
          </View>
        )}
        <View style={S.divider} />

        {/* Escalation */}
        <Text style={S.body}>
          If you wish to challenge this classification, dispute any of the signals above,
          or request a replay of the assessment, please contact your Information Officer
          using the details on file with your letting agent. You may also lodge a complaint
          with the Information Regulator of South Africa at www.justice.gov.za/inforeg.
        </Text>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            Pleks · privacy@pleks.co.za · This response is issued under POPIA Section 23 and does not constitute a tenancy decision.
            The letting agent or landlord makes the tenancy decision. Pleks processes personal information as described in the POPIA
            Register at {APP_URL}/privacy/register.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
