/**
 * lib/reports/screening/_web/primitives/ApplicantDetail/operational/ApplicantDetailOperational.tsx
 *
 * §1 ApplicantDetail — Operational mode (N>=5). Throughput-first scanning; row-per-applicant
 * table with horizontally scrollable overflow. Context rail is absent — all data in columns.
 * Alternating row stripe (bg-paper-deeper). Framing: bg-paper-sunk on header row.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.4/§10.3; doctrine.md co-located on PDF side.
 */
import type { JSX } from "react"
import { fmtZAR } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailOperationalProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailOperational({ applicants }: Readonly<ApplicantDetailOperationalProps>): JSX.Element {
  return (
    <div className="mb-5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Applicant detail</div>
      <div className="text-xs text-muted-foreground mb-3">Participant context for all parties to this lease.</div>
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-paper-sunk">
              {["APPL", "NAME", "NATIONALITY", "INCOME (SHARE)", "VERIFICATION", "BUREAUS", "NETWORK"].map(h => (
                <th key={h} className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applicants.map((e, i) => (
              <tr key={e.label} className={`border-b border-border last:border-0 ${i % 2 === 1 ? "bg-paper-deeper" : ""}`}>
                <td className="font-mono text-[10px] text-foreground px-3 py-2">{e.label}</td>
                <td className="font-mono text-[10px] text-foreground px-3 py-2">{e.fullName}</td>
                <td className="text-[10px] text-muted-foreground px-3 py-2">{e.nationalityStatus}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-[10px] text-foreground">{fmtZAR(e.verifiedIncomeCents)}</div>
                  <div className="text-[9px] text-muted-foreground">{e.incomeSharePct}% of joint</div>
                </td>
                <td className="font-mono text-[10px] text-foreground px-3 py-2">{e.verificationPassCount} of {e.verificationTotal}</td>
                <td className="font-mono text-[10px] text-foreground px-3 py-2">{bureauCount(e)}</td>
                <td className={`font-mono text-[10px] px-3 py-2 ${e.pleksNetworkStatus === "none" ? "text-muted-foreground" : "text-foreground"}`}>
                  {networkCompact(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
