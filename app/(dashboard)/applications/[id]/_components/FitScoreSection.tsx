/**
 * app/(dashboard)/applications/[id]/_components/FitScoreSection.tsx — Stream 2 FitScore dashboard surface
 *
 * Auth:   agent workspace (server component — data passed from parent page)
 * Data:   fitscore_* columns from applications row; narrative JSONB; component_snapshot JSONB
 * Notes:  Shows 4-pillar header, dimension cards (nationality-aware), narrative columns, material flags.
 *         LDP state renders distinct layout (no composite, no dimensions, available evidence table).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.3–6.10, §10.7.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import type { MaterialFlag } from "@/lib/screening/fitScoreEngine.v1"

// ─── Labels and colours (web — parallel to PDF theme.ts tokens) ───────────────

const BAND_LABELS: Record<string, string> = {
  verified_stability:   'Verified Stability',
  stable_profile:       'Stable Profile',
  cautious_review:      'Cautious Review',
  limited_confidence:   'Limited Confidence',
  adverse_signals:      'Adverse Signals',
  limited_data_profile: 'Limited Data Profile',
  blocked:              'Blocked',
}

const GRADE_LABELS: Record<string, string> = {
  high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Insufficient', limited: 'Limited',
}

const BAND_BADGE_CLS: Record<string, string> = {
  verified_stability:   'bg-emerald-100 text-emerald-900',
  stable_profile:       'bg-green-100 text-green-900',
  cautious_review:      'bg-amber-100 text-amber-900',
  limited_confidence:   'bg-orange-100 text-orange-900',
  adverse_signals:      'bg-red-100 text-red-900',
  limited_data_profile: 'bg-slate-100 text-slate-700',
  blocked:              'bg-red-200 text-red-950',
}

const FLAG_CLASS_ORDER: Record<string, number> = { critical: 0, capping: 1, trust: 2 }

const CAPPING_SEVERITY: Record<string, number> = {
  cautious_review: 0, limited_confidence: 1, stable_profile: 2,
}

function cappingSeverity(capCeiling: string | null): number {
  return capCeiling !== null ? (CAPPING_SEVERITY[capCeiling] ?? 2) : 3
}

function sortFlags(flags: MaterialFlag[]): MaterialFlag[] {
  return [...flags].sort((a, b) => {
    const classOrd = (FLAG_CLASS_ORDER[a.class] ?? 1) - (FLAG_CLASS_ORDER[b.class] ?? 1)
    if (classOrd !== 0) return classOrd
    if (a.class === 'capping' && b.class === 'capping') {
      return cappingSeverity(a.capCeiling) - cappingSeverity(b.capCeiling)
    }
    return 0
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pillar({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function DimensionCard({
  name, score, evidenceLine,
}: Readonly<{ name: string; score: number | null; evidenceLine: string | null }>) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{name}</p>
      <p className="text-2xl font-heading font-bold">{score !== null ? score : '—'}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
      {evidenceLine && <p className="text-xs text-muted-foreground">{evidenceLine}</p>}
    </div>
  )
}

function FlagRow({ flag }: Readonly<{ flag: MaterialFlag }>) {
  const isDashed = flag.class === 'trust'
  const FLAG_BG: Record<string, string> = { critical: 'bg-red-50', capping: 'bg-amber-50', trust: 'bg-slate-50' }
  const FLAG_TEXT: Record<string, string> = { critical: 'text-red-900', capping: 'text-amber-900', trust: 'text-slate-700' }
  const FLAG_BORDER: Record<string, string> = { critical: '#ef4444', capping: '#f59e0b', trust: '#94a3b8' }
  const bgCls = FLAG_BG[flag.class] ?? 'bg-slate-50'
  const textCls = FLAG_TEXT[flag.class] ?? 'text-slate-700'
  const borderColor = FLAG_BORDER[flag.class] ?? '#94a3b8'

  const label = flag.applicantLabel
    ? `${flag.description} — ${flag.applicantLabel}`
    : flag.description

  return (
    <div
      className={`p-2 mb-1 rounded-r text-sm ${bgCls} ${textCls}`}
      style={{ borderLeft: `3px ${isDashed ? 'dashed' : 'solid'} ${borderColor}` }}
    >
      <span className="font-medium text-xs uppercase mr-1 opacity-60">{flag.class}</span>
      {label}
    </div>
  )
}

function NarrativeBullet({ text }: Readonly<{ text: string }>) {
  return (
    <li className="text-sm text-foreground leading-relaxed">{text}</li>
  )
}

// ─── Standard layout (scored applications) ────────────────────────────────────

function DimensionGrid({
  components, narrative, isAllForeign, applicants,
}: Readonly<{
  components: { affordability: number; stability: number; creditBehaviour: number | null; verificationIntegrity: number }
  narrative: NarrativeResponse
  isAllForeign: boolean
  applicants: { isForeignNational: boolean }[]
}>) {
  const isMixed = !isAllForeign && applicants.some(a => a.isForeignNational)
  const saCitizenCount = applicants.filter(a => !a.isForeignNational).length

  const creditLine = (() => {
    if (isAllForeign) return null
    if (isMixed && narrative.creditEvidenceLine) {
      return `${narrative.creditEvidenceLine} (reflects ${saCitizenCount} of ${applicants.length} applicants)`
    }
    return narrative.creditEvidenceLine
  })()

  if (isAllForeign) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <DimensionCard name="Affordability" score={components.affordability} evidenceLine={narrative.affordabilityEvidenceLine} />
        <DimensionCard name="Stability" score={components.stability} evidenceLine={narrative.stabilityEvidenceLine} />
        <DimensionCard name="Verification Integrity" score={components.verificationIntegrity} evidenceLine={narrative.verificationEvidenceLine} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <DimensionCard name="Affordability" score={components.affordability} evidenceLine={narrative.affordabilityEvidenceLine} />
      <DimensionCard name="Stability" score={components.stability} evidenceLine={narrative.stabilityEvidenceLine} />
      <DimensionCard name="Credit Behaviour" score={components.creditBehaviour} evidenceLine={creditLine} />
      <DimensionCard name="Verification Integrity" score={components.verificationIntegrity} evidenceLine={narrative.verificationEvidenceLine} />
    </div>
  )
}

function NarrativeSection({ narrative }: Readonly<{ narrative: NarrativeResponse }>) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observed Strengths</p>
        {narrative.observedStrengths.length > 0 ? (
          <ul className="space-y-1 list-none">
            {narrative.observedStrengths.map((s, i) => <NarrativeBullet key={i} text={s} />)}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">No observed strengths at this time.</p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observed Concerns</p>
        {narrative.observedConcerns.length > 0 ? (
          <ul className="space-y-1 list-none">
            {narrative.observedConcerns.map((s, i) => <NarrativeBullet key={i} text={s} />)}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">No material concerns observed.</p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Limited Visibility</p>
        {narrative.limitedVisibility.length > 0 ? (
          <ul className="space-y-1 list-none">
            {narrative.limitedVisibility.map((s, i) => <NarrativeBullet key={i} text={s} />)}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">All standard signals available.</p>
        )}
      </div>
    </div>
  )
}

// ─── LDP layout ───────────────────────────────────────────────────────────────

type EvidenceStatus = 'pass' | 'fail' | 'not_available' | 'pending'

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  pass: 'PASSED', fail: 'FAILED', not_available: 'NOT AVAILABLE', pending: 'PENDING',
}
const STATUS_CLS: Record<EvidenceStatus, string> = {
  pass: 'text-emerald-700', fail: 'text-red-700', not_available: 'text-muted-foreground', pending: 'text-amber-700',
}

function EvidenceRow({ label, status, note }: Readonly<{ label: string; status: EvidenceStatus; note?: string }>) {
  return (
    <div className="flex items-baseline gap-3 py-2 border-b border-border text-sm">
      <span className="flex-1 font-medium">{label}</span>
      <span className={`text-xs font-bold uppercase w-28 shrink-0 ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
      {note && <span className="text-muted-foreground flex-2 text-xs">{note}</span>}
    </div>
  )
}

function LdpContent({ flags, narrative }: Readonly<{ flags: MaterialFlag[]; narrative: NarrativeResponse }>) {
  const hasDeceased = flags.some(f => f.flag === 'deceased_status')
  const hasBureauPartial = flags.some(f => f.flag === 'bureau_coverage_partial')
  const hasIncomeDiscrepancy = flags.some(f => f.flag === 'material_income_discrepancy')

  return (
    <div>
      <div className="rounded-lg border-l-4 border-l-slate-400 bg-slate-50 p-4 mb-4">
        <p className="font-semibold text-slate-800 mb-1">FitScore — Limited Data Profile</p>
        <p className="text-sm text-slate-600">
          Pleks has not produced a numeric FitScore for this application because the available
          evidence falls below the threshold required for a confident composite assessment.
        </p>
      </div>

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Available Evidence</p>
      <EvidenceRow
        label="Identity verification"
        status={hasDeceased ? 'fail' : 'not_available'}
        note="Home Affairs DHA-NPR match"
      />
      <EvidenceRow
        label="Bureau credit data"
        status="not_available"
        note={hasBureauPartial ? 'Partial bureau coverage — see material flags' : 'No bureau responses received'}
      />
      <EvidenceRow
        label="Income evidence"
        status={hasIncomeDiscrepancy ? 'fail' : 'not_available'}
        note={hasIncomeDiscrepancy ? 'Income discrepancy flagged' : 'Insufficient income evidence for verification'}
      />
      {narrative.ldpSummary && (
        <EvidenceRow label="Engine assessment" status="not_available" note={narrative.ldpSummary} />
      )}
    </div>
  )
}

// ─── Applicant roster (multi-applicant only) ──────────────────────────────────

interface SnapApplicant {
  label: string
  isForeignNational: boolean
  verifiedIncomeCents: number
  incomeSharePct: number
  bureauProcessing: { responding: string[]; outliers: string[] }
}

function ApplicantRosterRow({ snap, coName }: Readonly<{ snap: SnapApplicant; coName: string | null }>) {
  const bureaus = snap.bureauProcessing.responding.filter(b => !snap.bureauProcessing.outliers.includes(b))
  return (
    <div className="py-2 border-b border-border text-sm last:border-0">
      <div className="flex justify-between items-baseline">
        <span className="font-semibold">Applicant {snap.label}{coName ? ` — ${coName}` : ''}</span>
        <span className="text-muted-foreground text-xs">{snap.isForeignNational ? 'Foreign National' : 'SA Resident'}</span>
      </div>
      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
        <span>Verified: {formatZAR(snap.verifiedIncomeCents)}/mo ({Math.round(snap.incomeSharePct)}%)</span>
        <span>Bureaus: {bureaus.length > 0 ? bureaus.join(', ') : 'None'}</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AppData {
  id: string
  fitscore: number | null
  fitscore_band: string | null
  fitscore_confidence_index: string | null
  fitscore_verification_integrity: string | null
  fitscore_material_flags: unknown
  fitscore_components: unknown
  fitscore_component_snapshot: unknown
  fitscore_narrative: unknown
  applicant_nationality_type: string | null
  is_foreign_national: boolean
}

interface CoApplicant {
  id: string
  first_name: string | null
  last_name: string | null
  id_type: string | null
}

interface Props {
  app: AppData
  coApplicants: CoApplicant[]
}

export function FitScoreSection({ app, coApplicants }: Readonly<Props>) {
  if (!app.fitscore_band) return null

  const band = app.fitscore_band
  const narrative = app.fitscore_narrative as NarrativeResponse | null
  const materialFlags = (app.fitscore_material_flags ?? []) as MaterialFlag[]
  const components = app.fitscore_components as {
    affordability: number; stability: number
    creditBehaviour: number | null; verificationIntegrity: number
  } | null
  const rawSnap = app.fitscore_component_snapshot as {
    applicants: SnapApplicant[]
  } | null

  const sortedFlags = sortFlags(materialFlags)
  const badgeCls = BAND_BADGE_CLS[band] ?? 'bg-slate-100 text-slate-700'
  const bandLabel = BAND_LABELS[band] ?? band
  const isLdp = band === 'limited_data_profile'
  const isBlocked = band === 'blocked'

  const primaryNat = (app.applicant_nationality_type as string | null) ??
    (app.is_foreign_national ? 'foreign_national' : 'sa_citizen')
  const primaryIsForeign = primaryNat.startsWith('foreign_') || primaryNat === 'foreign_national'

  const coIsForeign = coApplicants.map(co => {
    const t = co.id_type
    return t !== 'sa_id' && t !== 'permanent_resident'
  })
  const allApplicantsForeign = primaryIsForeign && coIsForeign.every(Boolean)
  const snapApplicants = rawSnap?.applicants ?? []

  const coNames: (string | null)[] = coApplicants.map(co =>
    `${co.first_name ?? ''} ${co.last_name ?? ''}`.trim() || null
  )

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-3">
          FitScore (Stage 2)
          <span className={`px-2 py-0.5 rounded text-sm font-semibold ${badgeCls}`}>{bandLabel}</span>
          {!isBlocked && app.fitscore !== null && (
            <span className="text-base font-normal text-muted-foreground">{app.fitscore}/100</span>
          )}
          {isBlocked && <span className="text-base font-normal text-muted-foreground">— (Blocked)</span>}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* 4-pillar row */}
        <div className="grid grid-cols-4 gap-4 pb-4 border-b border-border">
          <Pillar label="Band">
            <span className={`text-sm font-semibold px-2 py-0.5 rounded self-start ${badgeCls}`}>{bandLabel}</span>
            {!isBlocked && app.fitscore !== null && (
              <span className="text-xs text-muted-foreground">Score: {app.fitscore}</span>
            )}
          </Pillar>
          <Pillar label="Confidence">
            <span className="text-sm font-semibold">
              {GRADE_LABELS[app.fitscore_confidence_index ?? ''] ?? (app.fitscore_confidence_index ?? '—')}
            </span>
          </Pillar>
          <Pillar label="Verification Integrity">
            <span className="text-sm font-semibold">
              {GRADE_LABELS[app.fitscore_verification_integrity ?? ''] ?? (app.fitscore_verification_integrity ?? '—')}
            </span>
          </Pillar>
          <Pillar label="Material Flags">
            {sortedFlags.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No material flags.</span>
            ) : (
              sortedFlags.map((f, i) => <FlagRow key={`${f.flag}-${i}`} flag={f} />)
            )}
          </Pillar>
        </div>

        {/* Band content */}
        {isLdp && narrative && (
          <LdpContent flags={materialFlags} narrative={narrative} />
        )}

        {!isLdp && components && narrative && (
          <>
            <DimensionGrid
              components={components}
              narrative={narrative}
              isAllForeign={allApplicantsForeign}
              applicants={[
                { isForeignNational: primaryIsForeign },
                ...coIsForeign.map(f => ({ isForeignNational: f })),
              ]}
            />
            <div className="border-t border-border pt-4">
              <NarrativeSection narrative={narrative} />
            </div>
          </>
        )}

        {/* Applicant roster (multi only) */}
        {snapApplicants.length > 1 && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Applicant Roster</p>
            {snapApplicants.map((snap, i) => (
              <ApplicantRosterRow
                key={snap.label}
                snap={snap}
                coName={i === 0 ? null : (coNames[i - 1] ?? null)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
