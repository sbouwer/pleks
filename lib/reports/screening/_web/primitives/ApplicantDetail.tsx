/**
 * lib/reports/screening/_web/primitives/ApplicantDetail.tsx — density-tiered participant detail
 *
 * Notes:  Web parity for _pdf/primitives/ApplicantDetail.tsx.
 *         Locked: N<=4 = rich-always (full field set); N>=5 = tabular.
 *         Returns null when applicants.length < 2.
 */
import type { JSX } from "react"
import { fmtZAR } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

function idLineRich(e: FitScoreApplicantEntry): string {
  if (e.isForeignNational) return `Passport · ${e.nationalityStatus}`
  const parts: string[] = ["ID"]
  if (e.idNumberMasked) parts.push(e.idNumberMasked.replaceAll("•", "*"))
  if (e.sex)            parts.push(e.sex)
  if (e.ageYears !== null) parts.push(`${e.ageYears}y`)
  return parts.join(" · ")
}

function networkFull(e: FitScoreApplicantEntry): string {
  if (e.pleksNetworkStatus === "trusted") return `${e.pleksNetworkTenancyCount} trusted tenancy`
  if (e.pleksNetworkStatus === "adverse") return "Adverse record"
  return "None on record"
}

function bureauFull(e: FitScoreApplicantEntry): string {
  return e.respondingBureaus.length > 0 ? e.respondingBureaus.join(", ") : "None"
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

function Field({ label, val, sub, muted = false }: Readonly<{
  label: string; val: string; sub?: string; muted?: boolean
}>): JSX.Element {
  return (
    <div className="mb-2 last:mb-0">
      <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
      <div className={`font-mono text-[10px] leading-snug ${muted ? "text-muted-foreground" : "text-foreground"}`}>{val}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>}
    </div>
  )
}

function RichCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>): JSX.Element {
  const emp = entry.employment
  return (
    <div className={`border border-border ${isLast ? "" : "mb-3"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border bg-muted/20">
        <span className="font-mono font-bold text-sm text-muted-foreground w-5 shrink-0">{entry.label}</span>
        <div className="flex-1">
          <div className="font-bold text-base text-foreground leading-tight">{entry.fullName}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{entry.nationalityStatus}</div>
        </div>
      </div>
      <div className="flex px-3 py-3 gap-4">
        <div className="flex-1">
          <Field label="Identity" val={idLineRich(entry)} />
          {emp === null
            ? <Field label="Employment" val="Not provided" muted />
            : (
              <>
                <Field label="Employer"  val={emp.employerName} />
                <Field label="Job title" val={emp.jobTitle} />
                <Field label="Tenure"    val={emp.tenureDisplay} />
              </>
            )
          }
        </div>
        <div className="flex-1">
          <Field label="Verified income" val={fmtZAR(entry.verifiedIncomeCents)} sub={`${entry.incomeSharePct}% of joint income`} />
          <Field label="Verification"    val={`${entry.verificationPassCount} of ${entry.verificationTotal} checks`} />
          <Field label="Bureau coverage" val={bureauFull(entry)} />
          <Field label="Pleks network"   val={networkFull(entry)} muted={entry.pleksNetworkStatus === "none"} />
        </div>
      </div>
    </div>
  )
}

function RichLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>): JSX.Element {
  return (
    <div>
      {applicants.map((e, i) => (
        <RichCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
      ))}
    </div>
  )
}

function TabularLayout({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>): JSX.Element {
  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {["APPL", "NAME", "NATIONALITY", "INCOME (SHARE)", "VERIFICATION", "BUREAUS", "NETWORK"].map(h => (
              <th key={h} className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {applicants.map((e, i) => (
            <tr key={e.label} className={`border-b border-border last:border-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
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
  )
}

interface ApplicantDetailProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetail({ applicants }: Readonly<ApplicantDetailProps>): JSX.Element | null {
  if (applicants.length < 2) return null
  const useTabular = applicants.length >= 5
  return (
    <div className="mb-5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Applicant detail</div>
      <div className="text-xs text-muted-foreground mb-3">Participant context for all parties to this lease.</div>
      {useTabular ? <TabularLayout applicants={applicants} /> : <RichLayout applicants={applicants} />}
    </div>
  )
}
