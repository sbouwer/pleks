/**
 * lib/reports/screening/_web/LdpReport.tsx — Limited Data Profile alternative layout
 *
 * Distinct layout for the LDP state — not a degraded standard layout (§6.10).
 * The engine refused to produce a score; this surface reflects that refusal honestly.
 * Tribunal-match: mirrors PDF agent_limited_data.tsx content.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.10, Phase F.2.
 */
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import type { MaterialFlag } from "@/lib/screening/fitScoreEngine.v1"
import { SectionLabel, EvidenceRow } from "./shared"

export function LdpReport({ data }: Readonly<{ data: FitScoreReportData }>) {
  const { materialFlags, narrative, applicants } = data

  const hasDeceased       = materialFlags.some((f: MaterialFlag) => f.flag === 'deceased_status')
  const hasBureauPartial  = materialFlags.some((f: MaterialFlag) => f.flag === 'bureau_coverage_partial')
  const hasIncomeMismatch = materialFlags.some((f: MaterialFlag) => f.flag === 'material_income_discrepancy')

  return (
    <div className="space-y-5">
      {/* Refusal explanation */}
      <div className="rounded-lg border-l-4 border-l-slate-400 bg-slate-50 p-4">
        <p className="font-semibold text-slate-800 mb-1">FitScore — Limited Data Profile</p>
        <p className="text-sm text-slate-600">
          Pleks has not produced a numeric FitScore for this application because the available
          evidence falls below the threshold required for a confident composite assessment.
          Manual review by the agent is required.
        </p>
      </div>

      {/* Available evidence table */}
      <div>
        <SectionLabel>Available Evidence</SectionLabel>
        <EvidenceRow
          label="Identity verification"
          status={hasDeceased ? 'fail' : 'not_available'}
          note="Home Affairs DHA-NPR match"
        />
        <EvidenceRow
          label="Bureau credit data"
          status="not_available"
          note={hasBureauPartial
            ? 'Partial bureau coverage — see material flags'
            : 'No bureau responses received'}
        />
        <EvidenceRow
          label="Income evidence"
          status={hasIncomeMismatch ? 'fail' : 'not_available'}
          note={hasIncomeMismatch
            ? 'Income discrepancy flagged'
            : 'Insufficient income evidence for verification'}
        />
        {narrative.ldpSummary && (
          <EvidenceRow
            label="Engine assessment"
            status="not_available"
            note={narrative.ldpSummary}
          />
        )}
      </div>

      {/* Material flags (LDP often has data-gap flags) */}
      {materialFlags.length > 0 && (
        <div>
          <SectionLabel>Material Flags</SectionLabel>
          {materialFlags.map((f, i) => (
            <div key={`${f.flag}-${i}`} className="text-sm text-muted-foreground py-1 border-b border-border last:border-0">
              • {f.description}
              {f.applicantLabel && ` — ${f.applicantLabel}`}
            </div>
          ))}
        </div>
      )}

      {/* Applicant list (names only — no per-applicant scoring in LDP) */}
      {applicants.length > 1 && (
        <div>
          <SectionLabel>Applicants on Lease</SectionLabel>
          {applicants.map(a => (
            <p key={a.label} className="text-sm py-1">
              <span className="font-medium">Applicant {a.label}</span>
              {a.fullName !== `Applicant ${a.label}` && ` — ${a.fullName}`}
              <span className="ml-2 text-xs text-muted-foreground">{a.nationalityStatus}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
