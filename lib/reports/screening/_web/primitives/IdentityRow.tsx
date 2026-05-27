/**
 * lib/reports/screening/_web/primitives/IdentityRow.tsx — per-applicant identity row
 *
 * Notes:  Web parity for _pdf/primitives/IdentityRow.tsx.
 *         Shows primary applicant only; co-applicants render in ApplicantDetail.
 */
import type { JSX } from "react"
import { fmtShortDate, fmtTime } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreReportData, FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

function buildIdLine(entry: FitScoreApplicantEntry): string {
  if (entry.isForeignNational) return `Passport · ${entry.nationalityStatus}`
  const masked = entry.idNumberMasked ? entry.idNumberMasked.replaceAll("•", "*") : ""
  const parts: string[] = ["ID"]
  if (masked) parts.push(masked)
  if (entry.sex) parts.push(entry.sex)
  if (entry.ageYears !== null) parts.push(`${entry.ageYears}y`)
  return parts.join(" · ")
}

interface IdentityRowProps {
  data: FitScoreReportData
}

export function IdentityRow({ data }: Readonly<IdentityRowProps>): JSX.Element | null {
  if (data.applicants.length === 0) return null

  const entry      = data.applicants[0]
  const isJoint    = data.applicants.length >= 2
  const idLine     = buildIdLine(entry)
  const employer   = entry.employment?.employerName ?? "Employment not provided"
  const empSub     = entry.employment
    ? `${entry.employment.jobTitle} · ${entry.employment.tenureDisplay}`
    : ""
  const screenDate = fmtShortDate(data.generatedAt)
  const screenTime = fmtTime(data.generatedAt)

  const surname     = entry.fullName.split(/\s+/).at(-1) ?? entry.fullName
  const nameDisplay = isJoint ? `${surname} + ${data.applicants.length - 1}` : entry.fullName
  const metaDisplay = isJoint ? "Joint application" : idLine

  return (
    <div className="border border-t-2 border-t-foreground border-border bg-card mb-5">
      <div className="flex">
        <div className="flex-1 px-4 py-3 border-r border-border">
          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1.5">{isJoint ? "Applicants" : "Applicant"}</div>
          <div className="font-bold text-lg text-foreground leading-tight">{nameDisplay}</div>
          <div className="text-xs text-muted-foreground mt-1">{metaDisplay}</div>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-border">
          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1.5">Employment</div>
          <div className="font-mono text-[13px] text-foreground leading-tight">{employer}</div>
          {empSub && <div className="text-xs text-muted-foreground mt-1">{empSub}</div>}
        </div>
        <div className="flex-1 px-4 py-3">
          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1.5">Screened</div>
          <div className="font-mono text-[13px] text-foreground leading-tight">{screenDate}</div>
          <div className="text-xs text-muted-foreground mt-1">{screenTime} SAST · auto-refresh nightly</div>
        </div>
      </div>
    </div>
  )
}
