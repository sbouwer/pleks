/**
 * lib/reports/screening/_web/ProfileSection.tsx — Band header + dimension grid + material flags
 *
 * Mirrors the PDF Profile section (EditorialHeadline, BandLadder, DimensionCardEditorial, MetaStrip).
 * Tribunal-match: same information content as PDF page 1.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.3–6.5, Phase F.2.
 */
import { formatZAR } from "@/lib/constants"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import type { MaterialFlag } from "@/lib/screening/fitScoreEngine.v1"
import {
  BAND_BADGE_CLS, BAND_LABELS, BAND_ORDER, GRADE_LABELS,
  BandBadge, SectionLabel, DOCTRINE_DISCLAIMER,
} from "./shared"
import type { FitScoreBand } from "@/lib/screening/fitScoreEngine.v1"

// ─── Flag sort (mirrors FitScoreSection logic) ────────────────────────────────

const FLAG_CLASS_ORDER: Record<string, number> = { critical: 0, capping: 1, trust: 2 }
const CAPPING_SEVERITY: Record<string, number> = { cautious_review: 0, limited_confidence: 1, stable_profile: 2 }

function cappingSev(capCeiling: string | null) {
  return capCeiling !== null ? (CAPPING_SEVERITY[capCeiling] ?? 2) : 3
}

function sortFlags(flags: MaterialFlag[]): MaterialFlag[] {
  return [...flags].sort((a, b) => {
    const d = (FLAG_CLASS_ORDER[a.class] ?? 1) - (FLAG_CLASS_ORDER[b.class] ?? 1)
    if (d !== 0) return d
    if (a.class === 'capping' && b.class === 'capping') return cappingSev(a.capCeiling) - cappingSev(b.capCeiling)
    return 0
  })
}

// ─── Flag row ─────────────────────────────────────────────────────────────────

function FlagRow({ flag }: Readonly<{ flag: MaterialFlag }>) {
  const isDashed = flag.class === 'trust'
  const FLAG_BG:     Record<string, string> = { critical: 'bg-[#fef2f2]', capping: 'bg-[#f9f9f8]', trust: 'bg-[#f0fdf4]' }
  const FLAG_TEXT:   Record<string, string> = { critical: 'text-red-900',  capping: 'text-slate-700', trust: 'text-emerald-900' }
  const FLAG_BORDER: Record<string, string> = { critical: '#b91c1c',       capping: '#6b7280',        trust: '#1a5c3a' }
  return (
    <div
      className={`p-2 mb-1 rounded-r text-sm ${FLAG_BG[flag.class] ?? 'bg-slate-50'} ${FLAG_TEXT[flag.class] ?? 'text-slate-700'}`}
      style={{ borderLeft: `3px ${isDashed ? 'dashed' : 'solid'} ${FLAG_BORDER[flag.class] ?? '#94a3b8'}` }}
    >
      <span className="font-medium text-xs uppercase mr-1 opacity-60">{flag.class}</span>
      {flag.applicantLabel ? `${flag.description} — ${flag.applicantLabel}` : flag.description}
    </div>
  )
}

// ─── Band ladder visual ───────────────────────────────────────────────────────

function BandLadder({ band }: Readonly<{ band: FitScoreBand }>) {
  return (
    <div className="flex flex-col gap-0.5">
      {BAND_ORDER.map((b) => {
        const isCurrent = b === band
        const isLdp = band === 'limited_data_profile' && b === 'limited_data_profile'
        const badgeCls = BAND_BADGE_CLS[b]
        return (
          <div
            key={b}
            className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-opacity ${isCurrent || isLdp ? 'opacity-100' : 'opacity-30'}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${isCurrent ? 'bg-current' : 'bg-border'}`} />
            <span className={isCurrent ? `px-1.5 py-0.5 rounded ${badgeCls}` : 'text-muted-foreground'}>
              {BAND_LABELS[b]}
            </span>
            {isCurrent && (
              <span className="ml-auto text-[10px] text-muted-foreground">← current</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Dimension card ───────────────────────────────────────────────────────────

function DimCard({
  name, score, evidenceLine,
}: Readonly<{ name: string; score: number | null; evidenceLine: string | null }>) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{name}</p>
      <p className="text-2xl font-heading font-bold">
        {score !== null ? score : '—'}
        <span className="text-sm font-normal text-muted-foreground">/100</span>
      </p>
      {evidenceLine && <p className="text-xs text-muted-foreground">{evidenceLine}</p>}
    </div>
  )
}

// ─── Dimension grid (2×2 SA / 3-col foreign) ─────────────────────────────────

function DimensionGrid({ data }: Readonly<{ data: FitScoreReportData }>) {
  const { dimensionalScores: ds, narrative, isAllForeignNational, applicants } = data
  const n = narrative

  if (isAllForeignNational) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <DimCard name="Affordability" score={ds.affordability} evidenceLine={n.affordabilityEvidenceLine} />
        <DimCard name="Stability" score={ds.stability} evidenceLine={n.stabilityEvidenceLine} />
        <DimCard name="Verification Integrity" score={ds.verificationIntegrity} evidenceLine={n.verificationEvidenceLine} />
      </div>
    )
  }

  const isMixed = applicants.some(a => a.isForeignNational) && !isAllForeignNational
  const saCitizenCount = applicants.filter(a => !a.isForeignNational).length
  const creditLine = isMixed && n.creditEvidenceLine
    ? `${n.creditEvidenceLine} (reflects ${saCitizenCount} of ${applicants.length} applicants)`
    : n.creditEvidenceLine

  return (
    <div className="grid grid-cols-2 gap-3">
      <DimCard name="Affordability" score={ds.affordability} evidenceLine={n.affordabilityEvidenceLine} />
      <DimCard name="Stability" score={ds.stability} evidenceLine={n.stabilityEvidenceLine} />
      <DimCard name="Credit Behaviour" score={ds.creditBehaviour} evidenceLine={creditLine} />
      <DimCard name="Verification Integrity" score={ds.verificationIntegrity} evidenceLine={n.verificationEvidenceLine} />
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ProfileSection({ data }: Readonly<{ data: FitScoreReportData }>) {
  const { band, score, confidenceIndex, verificationIntegrity, materialFlags, isLdp, leaseIntent } = data
  const sortedFlags = sortFlags(materialFlags)

  return (
    <div className="space-y-5">
      {/* Document title sub-line */}
      <div>
        <p className="text-xs text-muted-foreground">{data.unitLabel}</p>
        {data.coApplicantCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.primaryApplicantName} and {data.coApplicantCount} co-applicant{data.coApplicantCount > 1 ? 's' : ''}
          </p>
        )}
        {leaseIntent.monthlyRentCents > 0 && (
          <p className="text-xs text-muted-foreground">
            Asking rent: {formatZAR(leaseIntent.monthlyRentCents)}/month
          </p>
        )}
      </div>

      {/* 4-pillar header */}
      <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30 border border-border">
        {/* Pillar 1 — Band */}
        <div className="flex flex-col gap-1">
          <SectionLabel>Band</SectionLabel>
          <BandBadge band={band} />
          {!isLdp && score !== null && (
            <span className="text-xs text-muted-foreground mt-0.5">Score {score}/100 (metadata)</span>
          )}
          {band === 'blocked' && (
            <span className="text-xs text-muted-foreground mt-0.5">— (Blocked)</span>
          )}
        </div>

        {/* Pillar 2 — Confidence */}
        <div className="flex flex-col gap-1">
          <SectionLabel>Confidence</SectionLabel>
          <span className="text-sm font-semibold">
            {confidenceIndex ? (GRADE_LABELS[confidenceIndex] ?? confidenceIndex) : '—'}
          </span>
        </div>

        {/* Pillar 3 — Verification Integrity */}
        <div className="flex flex-col gap-1">
          <SectionLabel>Verification Integrity</SectionLabel>
          <span className="text-sm font-semibold">
            {verificationIntegrity ? (GRADE_LABELS[verificationIntegrity] ?? verificationIntegrity) : '—'}
          </span>
        </div>

        {/* Pillar 4 — Material Flags */}
        <div className="flex flex-col gap-1">
          <SectionLabel>Material Flags</SectionLabel>
          {sortedFlags.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No material flags.</span>
          ) : (
            sortedFlags.map((f, i) => <FlagRow key={`${f.flag}-${i}`} flag={f} />)
          )}
        </div>
      </div>

      {/* Doctrine disclaimer */}
      <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-3">
        {DOCTRINE_DISCLAIMER}
      </p>

      {/* Band ladder + dimensions */}
      {!isLdp && (
        <div className="grid grid-cols-[180px_1fr] gap-6 items-start">
          <div>
            <SectionLabel>Band Position</SectionLabel>
            <BandLadder band={band} />
          </div>
          <div>
            <SectionLabel>Dimensional Scores</SectionLabel>
            <DimensionGrid data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
