/**
 * scripts/render-e1-chrome-test.ts — E.1 chrome validation render
 *
 * Run:    npm run render:fitscore-e1
 * Output: lib/reports/screening/_pdf/__samples__/e1-chrome-test.pdf
 *
 * Renders a 4-page document using DocumentShell with placeholder content blocks.
 * Purpose: verify AuditStrip bleed, Watermark position, RunningHeader identity + END marker,
 *          PageFooter version-pinned URL, and overall chrome consistency before E.2.
 *
 * FITSCORE_FONT_SOURCE=local is injected by the npm script via cross-env so that
 * _primitives/theme.ts calls fontkit.open() (local paths) instead of fetch (HTTP).
 * Do not invoke tsx directly — esbuild hoists imports before statements, so
 * setting process.env in-source runs too late.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1 acceptance criteria.
 */

import { Document, renderToBuffer, View, Text, StyleSheet } from "@react-pdf/renderer"
import { createElement as h } from "react"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

import { DocumentShell } from "@/lib/reports/screening/_pdf/primitives/DocumentShell"
import type { FitScoreReportData } from "@/lib/reports/screening/_pdf/primitives/theme"
import { C } from "@/lib/reports/screening/_pdf/primitives/theme"


const OUT_DIR = path.resolve(process.cwd(), 'lib/reports/screening/_pdf/__samples__')

// ─── Fixture data ─────────────────────────────────────────────────────────────

const FIXTURE: FitScoreReportData = {
  applicationRef:       'PLK-2026-0001',
  unitLabel:            '3-bedroom house, Claremont, Cape Town',
  generatedAt:          '2026-05-22T10:00:00+02:00',
  primaryApplicantName: 'Jane Doe',
  coApplicantCount:     1,
  applicants: [
    {
      label:                 'Applicant A',
      fullName:              'Jane Doe',
      nationalityStatus:     'SA Citizen',
      verifiedIncomeCents:   4500000,
      incomeSharePct:        65,
      verificationPassCount: 5,
      verificationTotal:     5,
      respondingBureaus:     ['TransUnion', 'Experian', 'VeriCred'],
      pleksNetworkStatus:    'trusted',
      pleksNetworkTenancyCount: 2,
      isForeignNational:     false,
    },
    {
      label:                 'Applicant B',
      fullName:              'John Doe',
      nationalityStatus:     'SA Citizen',
      verifiedIncomeCents:   2400000,
      incomeSharePct:        35,
      verificationPassCount: 4,
      verificationTotal:     5,
      respondingBureaus:     ['TransUnion', 'VeriCred'],
      pleksNetworkStatus:    'none',
      pleksNetworkTenancyCount: 0,
      isForeignNational:     false,
    },
  ],
  band:                   'stable_profile',
  score:                  78,
  confidenceIndex:        'high',
  verificationIntegrity:  'high',
  dimensionalScores: {
    affordability:       81,
    stability:           76,
    creditBehaviour:     74,
    verificationIntegrity: 88,
  },
  materialFlags:          [],
  isLdp:                  false,
  isAllForeignNational:   false,
  narrative: {
    observedStrengths:         ['Income verified across three bureaus.', 'Two prior tenancies in good standing.'],
    observedConcerns:          [],
    limitedVisibility:         [],
    affordabilityEvidenceLine: 'Rent 22% of verified joint income.',
    stabilityEvidenceLine:     'Income-weighted tenure 3.8 years.',
    creditEvidenceLine:        'Coverage-weighted median; no outliers.',
    verificationEvidenceLine:  'Five of five checks passed.',
    ldpSummary:                null,
    isTemplated:               false,
    failureReason:             null,
  },
  engineVersion:          'fitscore.v1.0',
  narrativeVersion:       'narr.v1.0',
  interpretationVersion:  'v1.0',
  inputsHash:             'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
  orgName:                'Bouwer Property Group (Pty) Ltd',
}

// ─── Placeholder block ────────────────────────────────────────────────────────

const PS = StyleSheet.create({
  block: {
    borderWidth:   0.75,
    borderColor:   C.rule.base,
    borderRadius:  2,
    padding:       20,
    marginBottom:  16,
    backgroundColor: C.surface.paperSunk,
  },
  label: {
    fontFamily:   'JetBrains Mono',
    fontSize:     7.5,
    color:        C.ink.faint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  8,
  },
  text: {
    fontFamily: 'Inter Tight',
    fontSize:   9.5,
    color:      C.ink.mute,
    lineHeight: 1.55,
  },
})

function Placeholder({ label, lines = 3 }: { label: string; lines?: number }) {
  const filler = Array.from({ length: lines }, (_, i) =>
    `Placeholder content line ${i + 1} — will be replaced by E.2–E.4 primitives.`
  ).join('\n')
  return h(View, { style: PS.block },
    h(Text, { style: PS.label }, label),
    h(Text, { style: PS.text }, filler)
  )
}

// ─── Document ─────────────────────────────────────────────────────────────────

const doc = h(Document, {},
  h(DocumentShell, { data: FIXTURE, section: 'Profile', showAuditStrip: true },
    h(Placeholder, { label: 'E.2 — Profile: EditorialHeadline + MetaStrip', lines: 4 }),
    h(Placeholder, { label: 'E.2 — BandLadder + TierBar', lines: 6 }),
    h(Placeholder, { label: 'E.2 — FlagPillRow', lines: 2 }),
    h(Placeholder, { label: 'E.2 — DimensionCardEditorial ×4 (2×2 grid)', lines: 8 }),
  ),
  h(DocumentShell, { data: FIXTURE, section: 'Financial Analysis' },
    h(Placeholder, { label: 'E.3 — Income Reconciliation Table shell', lines: 6 }),
    h(Placeholder, { label: 'E.3 — Expenditure Table shell', lines: 6 }),
    h(Placeholder, { label: 'E.3 — DisposableBars shell', lines: 4 }),
  ),
  h(DocumentShell, { data: FIXTURE, section: 'Evidence & Credit' },
    h(Placeholder, { label: 'E.3 — RiskUncertaintySplit', lines: 4 }),
    h(Placeholder, { label: 'E.3 — BureauCoverageMatrix', lines: 4 }),
    h(Placeholder, { label: 'E.3 — DivergenceAxis', lines: 4 }),
    h(Placeholder, { label: 'E.3 — VerificationCheckTable', lines: 6 }),
  ),
  h(DocumentShell, { data: FIXTURE, section: 'Narrative' },
    h(Placeholder, { label: 'E.4 — NarrativeQuadrants (2×2)', lines: 8 }),
    h(Placeholder, { label: 'E.4 — ReadingGuidePanel (band-conditional)', lines: 4 }),
    h(Placeholder, { label: 'E.4 — EngineGuardrailsFooter', lines: 3 }),
  ),
)

// ─── Render ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const buf = await renderToBuffer(doc)
  const outPath = path.join(OUT_DIR, 'e1-chrome-test.pdf')
  writeFileSync(outPath, buf)
  console.log(`✓  ${outPath}  (${(buf.byteLength / 1024).toFixed(1)} KB)`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
