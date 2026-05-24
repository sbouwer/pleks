/**
 * lib/reports/screening/_web/shared.tsx — Shared atoms for the web FitScore report surface
 *
 * Notes: Web-format equivalents of the PDF theme tokens — Tailwind classes, not react-pdf styles.
 *        Raw colours match _primitives/theme.ts RAW values. Keep in sync.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6, Phase F.2.
 */
import type { FitScoreBand } from "@/lib/screening/fitScoreEngine.v1"

// ─── Band colours (Tailwind) ──────────────────────────────────────────────────

export const BAND_BADGE_CLS: Record<FitScoreBand, string> = {
  verified_stability:   'bg-[#dcfce7] text-[#1a5c3a]',
  stable_profile:       'bg-[#d1fae5] text-[#166534]',
  cautious_review:      'bg-[#fef9c3] text-[#92400e]',
  limited_confidence:   'bg-[#ffedd5] text-[#c2410c]',
  adverse_signals:      'bg-[#fee2e2] text-[#b91c1c]',
  limited_data_profile: 'bg-[#f3f4f6] text-[#374151]',
  blocked:              'bg-[#fde8e8] text-[#7f1d1d]',
}

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
  high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Insufficient', limited: 'Limited',
}

// Band ladder — ordered from best to worst
export const BAND_ORDER: FitScoreBand[] = [
  'verified_stability', 'stable_profile', 'cautious_review',
  'limited_confidence', 'adverse_signals', 'blocked',
]

export const DOCTRINE_DISCLAIMER =
  'This is not an approval or rejection. It is a record of the evidence Pleks received, ' +
  'how that evidence reconciles, and where uncertainty remains. ' +
  'Final tenancy decisions rest with the agent or landlord.'

// ─── Section label ────────────────────────────────────────────────────────────

export function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      {children}
    </p>
  )
}

// ─── Horizontal rule ──────────────────────────────────────────────────────────

export function ReportDivider() {
  return <div className="border-t border-border my-5" />
}

// ─── Band badge inline ────────────────────────────────────────────────────────

export function BandBadge({ band }: Readonly<{ band: FitScoreBand }>) {
  const cls = BAND_BADGE_CLS[band]
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-sm font-semibold ${cls}`}>
      {BAND_LABELS[band]}
    </span>
  )
}

// ─── Grade pill ───────────────────────────────────────────────────────────────

export function GradePill({ grade, label }: Readonly<{ grade: string | null; label: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">
        {grade ? (GRADE_LABELS[grade] ?? grade) : '—'}
      </span>
    </div>
  )
}

// ─── Verification status row ──────────────────────────────────────────────────

type EvidenceStatus = 'pass' | 'fail' | 'not_available' | 'pending'

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  pass: 'PASSED', fail: 'FAILED', not_available: 'N/A', pending: 'PENDING',
}
const STATUS_CLS: Record<EvidenceStatus, string> = {
  pass: 'text-emerald-700', fail: 'text-red-700', not_available: 'text-muted-foreground', pending: 'text-amber-700',
}

export function normaliseStatus(raw: string | null | undefined): EvidenceStatus {
  if (raw === 'pass' || raw === 'verified') return 'pass'
  if (raw === 'fail' || raw === 'failed') return 'fail'
  if (raw === 'pending') return 'pending'
  return 'not_available'
}

export function EvidenceRow({
  label, status, note,
}: Readonly<{ label: string; status: EvidenceStatus; note?: string }>) {
  return (
    <div className="flex items-baseline gap-3 py-2 border-b border-border text-sm last:border-0">
      <span className="flex-1 font-medium">{label}</span>
      <span className={`text-xs font-bold uppercase w-24 shrink-0 ${STATUS_CLS[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      {note && <span className="text-muted-foreground text-xs">{note}</span>}
    </div>
  )
}

// ─── Placeholder card (sections pending ADDENDUM_14D data) ───────────────────

export function PlaceholderCard({ label, reason }: Readonly<{ label: string; reason: string }>) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-center">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">{reason}</p>
    </div>
  )
}
