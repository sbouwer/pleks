/**
 * lib/reports/screening/_web/primitives/ApplicantDetail/interpretive/ApplicantDetailInterpretive.tsx
 *
 * §1 ApplicantDetail — Interpretive mode (N=2). Vertical-within-applicant reading; full
 * evidentiary depth per applicant. Card-per-applicant with two-column body: identity/employment
 * left, income/verification/bureaus/network right. Framing: bg-paper-sunk on card header.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.3/§4.4/§10.3; see doctrine.md (PDF-side co-located).
 */
import type { JSX } from "react"
import { fmtZAR } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function idLine(e: FitScoreApplicantEntry): string {
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

// ─── Field atom ───────────────────────────────────────────────────────────────

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

// ─── Per-applicant card ───────────────────────────────────────────────────────

function InterpretiveCard({ entry, isLast }: Readonly<{ entry: FitScoreApplicantEntry; isLast: boolean }>): JSX.Element {
  const emp = entry.employment
  return (
    <div className={`border border-border ${isLast ? "" : "mb-3"}`}>
      {/* Zone 1 — Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border bg-paper-sunk">
        <span className="font-mono font-bold text-sm text-muted-foreground w-5 shrink-0">{entry.label}</span>
        <div className="flex-1">
          <div className="font-bold text-base text-foreground leading-tight">{entry.fullName}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{entry.nationalityStatus}</div>
        </div>
      </div>
      {/* Zone 2 (context rail) + Zone 3 (verification body) — two-column body */}
      <div className="flex px-3 py-3 gap-4">
        <div className="flex-1">
          <Field label="Identity" val={idLine(entry)} />
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
      {/* Zone 4 — Signal strip (per-applicant flags; reserved) */}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ApplicantDetailInterpretiveProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetailInterpretive({ applicants }: Readonly<ApplicantDetailInterpretiveProps>): JSX.Element {
  const n = applicants.length
  const first = applicants[0]
  const surname = first.fullName.split(/\s+/).at(-1) ?? first.fullName
  const l1 = n === 1 ? "APPLICANT" : "APPLICANTS"
  const l2 = n === 1 ? first.fullName : `${surname} + ${n - 1}`
  const l3 = n === 1 ? idLine(first) : "Joint application"
  return (
    <div className="border border-border bg-paper-raised mb-5">
      <div className="border-b border-border px-3 py-2.5">
        <div className="font-mono text-[7.5px] uppercase tracking-widest text-muted-foreground mb-1">{l1}</div>
        <div className="font-bold text-sm text-foreground leading-tight mb-0.5">{l2}</div>
        <div className="font-mono text-[9px] text-muted-foreground">{l3}</div>
      </div>
      <div className="p-3">
        {applicants.map((e, i) => (
          <InterpretiveCard key={e.label} entry={e} isLast={i === applicants.length - 1} />
        ))}
      </div>
    </div>
  )
}
