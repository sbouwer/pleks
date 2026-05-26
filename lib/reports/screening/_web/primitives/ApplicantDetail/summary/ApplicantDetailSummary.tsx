/**
 * lib/reports/screening/_web/primitives/ApplicantDetail/summary/ApplicantDetailSummary.tsx
 *
 * §1 ApplicantDetail — Summary mode (N=3). Household-first reading posture. Three cards stacked
 * vertically; narrow left rail (identity only, visually subordinated) beside a right column of
 * household metrics. No job title; bureau count not names. Web-native projection of the
 * household-synthesis cognitive task; not a port of the PDF render tree.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.4/§10.3; doctrine.md co-located on PDF side.
 */
import type { JSX } from "react"
import { fmtZAR } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${e.nationalityStatus}`
  const parts: string[] = ["ID"]
  if (e.idNumberMasked) parts.push(e.idNumberMasked.replaceAll("•", "*"))
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
  return parts.join(" · ")
}

function networkCompact(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === "trusted") return `${e.pleksNetworkTenancyCount} trusted`
  if (e.pleksNetworkStatus === "adverse") return "Adverse"
  return "None"
}

function bureauCount(e: FitScoreApplicantEntry): string {
  const n = e.respondingBureaus.length
  if (n === 0) return "None"
  return `${n} bureau${n === 1 ? "" : "s"}`
}

// ─── Field atom ───────────────────────────────────────────────────────────────

function Field({ label, val, muted = false }: Readonly<{
  label: string; val: string; muted?: boolean
}>): JSX.Element {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="font-mono text-[7.5px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
      <div className={`font-mono text-[9.5px] leading-snug ${muted ? "text-muted-foreground" : "text-foreground"}`}>{val}</div>
    </div>
  )
}

// ─── Per-applicant card ───────────────────────────────────────────────────────

function SummaryCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>): JSX.Element {
  const emp = entry.employment
  return (
    <div className={`border border-border ${isLast ? "" : "mb-2.5"}`}>
      {/* Zone 1 — Compact header */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border bg-paper-sunk">
        <span className="font-mono font-bold text-xs text-muted-foreground w-4 shrink-0">{entry.label}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-foreground leading-tight truncate">{entry.fullName}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{entry.nationalityStatus}</div>
        </div>
      </div>
      {/* Zone 2 (narrow rail) + Zone 3 (metrics) — three-column body */}
      <div className="flex px-3 py-2.5 gap-3">
        {/* Narrow rail — identity context only, visually subordinated */}
        <div className="w-28 shrink-0 border-r border-border pr-3">
          <Field label="Identity" val={idLine(entry)} />
        </div>
        {/* Employment column */}
        <div className="flex-1 border-r border-border pr-3">
          {emp === null
            ? <Field label="Employment" val="Not provided" muted />
            : (
              <>
                <Field label="Employer" val={emp.employerName} />
                <Field label="Tenure"   val={emp.tenureDisplay} />
              </>
            )
          }
        </div>
        {/* Household metrics */}
        <div className="flex-1">
          <Field label="Income"       val={`${fmtZAR(entry.verifiedIncomeCents)} (${entry.incomeSharePct}%)`} />
          <Field label="Verification" val={`${entry.verificationPassCount} of ${entry.verificationTotal}`} />
          <Field label="Bureaus"      val={bureauCount(entry)} />
          <Field label="Network"      val={networkCompact(entry)} muted={entry.pleksNetworkStatus === "none"} />
        </div>
      </div>
      {/* Zone 4 — Signal strip (per-applicant flags; reserved) */}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailSummaryProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailSummary({ applicants }: Readonly<ApplicantDetailSummaryProps>): JSX.Element {
  return (
    <div className="mb-5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Applicant detail</div>
      <div className="text-xs text-muted-foreground mb-3">Participant context for all parties to this lease.</div>
      <div>
        {applicants.map((e, i) => (
          <SummaryCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
        ))}
      </div>
    </div>
  )
}
