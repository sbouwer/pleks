/**
 * lib/reports/screening/_web/primitives/ApplicantDetail/comparative/ApplicantDetailComparative.tsx
 *
 * §1 ApplicantDetail — Comparative mode (N=4). Horizontal-across-applicants reading direction.
 * Web-native comparison table: metric rows, applicant columns. Horizontal scroll on narrow
 * viewports. Spread-first cognitive posture — same metric is compared across all 4 applicants
 * on the same row. Not a port of the PDF 2×2 card grid.
 * Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.4/§10.3; doctrine.md co-located on PDF side.
 */
import type { JSX } from "react"
import { fmtZAR } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return "Passport"
  const parts: string[] = ["ID"]
  if (e.idNumberMasked) parts.push(e.idNumberMasked.replaceAll("•", "*"))
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Val({ val, muted = false }: Readonly<{ val: string; muted?: boolean }>): JSX.Element {
  return (
    <span className={`font-mono text-[10px] leading-snug ${muted ? "text-muted-foreground" : "text-foreground"}`}>{val}</span>
  )
}

// ─── Metric row in the comparison table ──────────────────────────────────────

function MetricRow({ label, cells, keys }: Readonly<{ label: string; cells: JSX.Element[]; keys: string[] }>): JSX.Element {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground px-3 py-2 bg-paper-sunk border-r border-border w-28 shrink-0 align-top">
        {label}
      </td>
      {cells.map((cell, i) => (
        <td key={keys[i]} className="px-3 py-2 border-r border-[var(--rule-strong)] last:border-0 align-top w-1/4">
          {cell}
        </td>
      ))}
    </tr>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailComparativeProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailComparative({ applicants }: Readonly<ApplicantDetailComparativeProps>): JSX.Element {
  const n = applicants.length
  const first = applicants[0]
  const surname = first.fullName.split(/\s+/).at(-1) ?? first.fullName
  const l1 = n === 1 ? "APPLICANT" : "APPLICANTS"
  const l2 = n === 1 ? first.fullName : `${surname} + ${n - 1}`
  const l3 = n === 1 ? "Single applicant" : "Joint application"

  return (
    <div className="border border-border bg-paper-raised mb-5">
      <div className="border-b border-border px-3 py-2.5">
        <div className="font-mono text-[7.5px] uppercase tracking-widest text-muted-foreground mb-1">{l1}</div>
        <div className="font-bold text-sm text-foreground leading-tight mb-0.5">{l2}</div>
        <div className="font-mono text-[9px] text-muted-foreground">{l3}</div>
      </div>
      {/* Comparison table — metric rows, applicant columns. Horizontal scroll on narrow viewports. */}
      <div className="p-3">
      <div className="overflow-x-auto border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-border">
              {/* Row-label column header (empty) */}
              <th className="px-3 py-2 bg-paper-sunk border-r border-border w-28" />
              {applicants.map(e => (
                <th key={e.label} className="px-3 py-2 border-r border-border last:border-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-muted-foreground shrink-0">{e.label}</span>
                    <div>
                      <div className="font-bold text-sm text-foreground leading-tight">{e.fullName}</div>
                      <div className="text-[9px] text-muted-foreground">{e.nationalityStatus}</div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow
              label="Identity"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => <Val key={e.label} val={idLine(e)} />)}
            />
            <MetricRow
              label="Employer"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => (
                <Val
                  key={e.label}
                  val={e.employment === null ? "Not provided" : e.employment.employerName}
                  muted={e.employment === null}
                />
              ))}
            />
            <MetricRow
              label="Income"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => (
                <span key={e.label} className="font-mono text-[10px] text-foreground">
                  {fmtZAR(e.verifiedIncomeCents)}
                  <span className="text-muted-foreground text-[9px] ml-1">({e.incomeSharePct}%)</span>
                </span>
              ))}
            />
            <MetricRow
              label="Verification"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => <Val key={e.label} val={`${e.verificationPassCount} of ${e.verificationTotal}`} />)}
            />
            <MetricRow
              label="Bureaus"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => <Val key={e.label} val={bureauCount(e)} />)}
            />
            <MetricRow
              label="Network"
              keys={applicants.map(e => e.label)}
              cells={applicants.map(e => (
                <Val key={e.label} val={networkCompact(e)} muted={e.pleksNetworkStatus === "none"} />
              ))}
            />
          </tbody>
        </table>
      </div>
      </div>
      {/* Zone 4 — Flag row (aggregate across all applicants; reserved) */}
    </div>
  )
}
