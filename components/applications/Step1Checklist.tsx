/**
 * components/applications/Step1Checklist.tsx — the shared Step-1 administrative readiness checklist.
 *
 * One legible "is this worth verifying?" surface, rendered for BOTH audiences (no hooks → server + client safe):
 *   • audience="agent"     — full strip incl. the ID-validity/fraud line (age · citizenship; never gender).
 *   • audience="applicant" — same checklist MINUS the ID/fraud line (that's an agent check); so the applicant
 *     sees what THEY can act on ("you still need to add a bank statement").
 * Every line is honest about its truth-level: structural facts stated plainly; declared figures attributed
 * ("on stated income"); documents are "uploaded (unverified)" — present, not proven. The roll-up is a sort
 * key + suggestion, never an auto-decline.
 */
import { formatZAR } from "@/lib/constants"
import type { FreeAssessmentResult, Step1Status, Residency } from "@/lib/applications/freeAssessment"

const ROLLUP: Record<Step1Status, { label: string; cls: string }> = {
  "verify-ready": { label: "Verify-ready", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  backstopped: { label: "Qualifies via surety", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  "missing-docs": { label: "Missing documents", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  "does-not-qualify": { label: "Doesn't qualify · on stated figures", cls: "border-red-200 bg-red-50 text-red-700" },
  incomplete: { label: "Didn't finish", cls: "border-red-200 bg-red-50 text-red-700" },
}
const RESIDENCY: Record<Residency, string | null> = {
  citizen: "SA citizen", permanent_resident: "permanent resident", foreign: "foreign national", unknown: null,
}
const AFFORD_CLS: Record<string, string> = {
  within: "text-emerald-700", marginal: "text-amber-700", below: "text-red-700", "no-income": "text-red-700",
}
type LineStatus = "ok" | "warn" | "bad"
const LINE_MARK: Record<LineStatus, string> = { ok: "✓", warn: "!", bad: "✗" }
const LINE_CLS: Record<LineStatus, string> = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600" }
// Affordability tier → checklist status (within = green, marginal = amber, below/no-income = red).
const AFFORD_STATUS: Record<string, LineStatus> = { within: "ok", marginal: "warn", below: "bad", "no-income": "bad" }

function Line({ status, children }: Readonly<{ status: LineStatus; children: React.ReactNode }>) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-px font-semibold ${LINE_CLS[status]}`} aria-hidden>{LINE_MARK[status]}</span>
      <span className="text-slate-700">{children}</span>
    </li>
  )
}

export function Step1Checklist({ assessment, rentCents, audience }: Readonly<{ assessment: FreeAssessmentResult; rentCents: number; audience: "agent" | "applicant" }>) {
  const a = assessment
  // Defensive defaults — a stored free_assessment from before this enrichment lacks some sub-objects.
  const documents = a.documents ?? []
  const readiness = a.readiness ?? { band: "incomplete" as const, items: [], allComplete: false, incompleteCount: 0, invalidIdCount: 0, total: 0 }
  const identity = a.identity ?? { ageYears: null, underageCannotSign: false, residency: "unknown" as const, dobMatchesDeclared: null }
  const employment = a.employment ?? { tenureMonths: null, recentlyStarted: false }
  const roll = ROLLUP[a.rollup] ?? ROLLUP.incomplete
  const missingDocs = documents.filter((d) => d.required && !d.present).map((d) => d.label)
  const ratio = a.declaredRatioPct
  const residency = RESIDENCY[identity.residency]

  // ID line (agent only) — precomputed to keep the JSX free of nested ternaries/templates.
  const idValid = readiness.invalidIdCount === 0
  const idFacts = [identity.ageYears == null ? "" : `age ${identity.ageYears}`, residency ?? ""].filter(Boolean)
  const idLineText = idValid ? ["ID valid", ...idFacts].join(" · ") : "ID number invalid (checksum fails)"

  // Affordability line — conditional on stated figures.
  const affordStatus = AFFORD_STATUS[a.affordabilityTier] ?? "warn"
  const affordNode = a.affordabilityTier === "no-income"
    ? "No income declared"
    : (
        <>On stated income, rent is <span className={`font-semibold ${AFFORD_CLS[a.affordabilityTier] ?? ""}`}>{ratio}%</span>
          {a.randLeftAfterRentCents != null && <> — {formatZAR(a.randLeftAfterRentCents)}/mo left</>}
          {a.incomeMultiple != null && <span className="text-slate-500"> · covers rent {a.incomeMultiple}×</span>}
        </>
      )

  return (
    <div className="space-y-3 text-sm">
      <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${roll.cls}`}>{roll.label}</span>

      <ul className="space-y-1.5">
        {/* 1 · Application complete */}
        <Line status={readiness.allComplete ? "ok" : "bad"}>
          {readiness.allComplete ? "Application complete — all parts finished" : "Incomplete — an applicant hasn't finished"}
        </Line>

        {/* 2 · Documents uploaded (unverified) — itemised slots */}
        <Line status={a.allRequiredDocsPresent ? "ok" : "warn"}>
          {a.allRequiredDocsPresent ? "Required documents uploaded " : `Missing: ${missingDocs.join(", ")} `}
          <span className="text-slate-400">(unverified)</span>
          {documents.length > 0 && (
            <span className="mt-0.5 block text-xs text-slate-500">
              {documents.map((d) => `${d.present ? "✓" : "✗"} ${d.label}`).join(" · ")}
            </span>
          )}
        </Line>

        {/* 3 · ID validity + decoded facts — AGENT ONLY (fraud check; never gender) */}
        {audience === "agent" && (
          <Line status={idValid ? "ok" : "bad"}>
            {idLineText}
            {identity.dobMatchesDeclared === false && <span className="ml-1 text-amber-600">· declared DOB ≠ ID</span>}
            {identity.underageCannotSign && <span className="ml-1 text-red-600">· under 18, cannot sign</span>}
          </Line>
        )}

        {/* 4 · Declared affordability — conditional on stated figures */}
        <Line status={affordStatus}>{affordNode}</Line>
      </ul>

      {/* Supporting, declared-scoped detail */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-500">
        <span>Rent {rentCents ? formatZAR(rentCents) : "—"}/mo</span>
        {a.combinedIncomeCents > 0 && <span>Declared income {formatZAR(a.combinedIncomeCents)}/mo</span>}
        {a.randLeftAfterObligationsCents != null && <span>After declared debits {formatZAR(a.randLeftAfterObligationsCents)}/mo</span>}
        {a.estimatedMoveInCents != null && <span>Est. move-in ≈ {formatZAR(a.estimatedMoveInCents)}</span>}
        {a.coApplicantDependency && <span className="text-amber-600">Affordable only on combined income</span>}
        {audience === "agent" && employment.recentlyStarted && <span className="text-amber-600">Started job &lt; 3 months ago</span>}
      </div>
      <p className="text-xs text-slate-400">Declared figures only — unverified. The deep scan runs after shortlisting.</p>
    </div>
  )
}
