/**
 * .../applications/[id]/_components/ScreeningRulingCard.tsx — agent-facing 14M pre-screen ruling
 *
 * Surfaces the latest application_screening_evaluations row (ADDENDUM_14M). FitScore-shows-all: the agent
 * sees EVERY flag — including the Signal flags hidden from the applicant (e.g. net-pay-vs-credit gap) — plus
 * the evidence reconciliation, document-integrity signals, and the reconciler/ruling versions for replay.
 * Read-only; the page is already gateway-gated + org-filtered.
 * Notes:  `docsChanged` is the re-queue test itself (docsChangedSinceLastPass). At MAX_SCREENING_ITERATIONS a document
 *         change re-runs nothing, so without the marker the agent reads a ruling on documents the applicant has since
 *         replaced (A18 walker N2). An unreadable answer (null) is said, never shown as current.
 */
import { DetailCard } from "@/components/detail/DetailCard"
import { formatZAR, MAX_SCREENING_ITERATIONS } from "@/lib/constants"
import type { RulingFlag } from "@/lib/applications/ruling"
import type { ReconciliationResult, FraudSignal } from "@/lib/extraction/types"

export interface ScreeningEvaluationRow {
  iteration_number: number
  ruling_tier: string
  affordability_tier: string
  affordability_ratio_pct: number | null
  demonstrated_housing_cents: number | null
  confidence_tier: string
  flags: RulingFlag[] | null
  reconciliation: ReconciliationResult | null
  fraud_signals: FraudSignal[] | null
  reconciler_version: string | null
  ruling_version: string | null
  generated_at: string
}

const RULING: Record<string, { label: string; cls: string }> = {
  strong:            { label: "Strong",          cls: "text-success" },
  adequate:          { label: "Adequate",        cls: "text-success" },
  "needs-evidence":  { label: "Needs evidence",  cls: "text-warning" },
  "below-threshold": { label: "Below threshold", cls: "text-danger" },
}
const AFFORD: Record<string, string> = { within: "Within 30% guideline", marginal: "Marginally over guideline", below: "Over 30% guideline", "demonstrated-override": "Demonstrated payment override", "residual-override": "Residual-income override (covers rent + obligations above the living floor)" }
const CONF: Record<string, string> = { strong: "Strong", adequate: "Adequate", "needs-evidence": "Needs evidence" }
const SEV: Record<string, string> = { block: "text-danger", major: "text-warning", minor: "text-muted-foreground", positive: "text-success" }

/** The staleness line, or null when the ruling read the current documents. */
export function stalenessNotice(docsChanged: boolean | null, iteration: number): string | null {
  if (docsChanged === null) return "Could not check whether the documents changed after this ruling — treat it as possibly out of date."
  if (!docsChanged) return null
  const base = "Documents were added or removed after this ruling, so it may not reflect them."
  return iteration >= MAX_SCREENING_ITERATIONS
    ? `${base} The applicant has used all ${MAX_SCREENING_ITERATIONS} pre-screen passes, so it will not re-run — review the documents yourself.`
    : base
}

export function ScreeningRulingCard({ evaluation, docsChanged }: Readonly<{ evaluation: ScreeningEvaluationRow; docsChanged: boolean | null }>) {
  const stale = stalenessNotice(docsChanged, evaluation.iteration_number)
  const flags = evaluation.flags ?? []
  const todos = flags.filter((f) => f.type === "fixable" || f.type === "structural")
  const signals = flags.filter((f) => f.type === "signal")
  const positives = flags.filter((f) => f.type === "override")
  const r = RULING[evaluation.ruling_tier] ?? RULING["needs-evidence"]
  const recon = evaluation.reconciliation
  const fraud = evaluation.fraud_signals ?? []

  return (
    <DetailCard title="Verified ruling · Step 2" headerAction={<span className={`text-sm font-semibold ${r.cls}`}>{r.label}</span>}>
      <div className="space-y-4 text-sm">
        {stale && <p role="status" className="text-xs text-warning border border-warning/40 rounded-[var(--r-button)] p-2">{stale}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-border p-3">
            <p className="text-xs text-muted-foreground">Affordability</p>
            <p className="font-medium">{evaluation.affordability_ratio_pct != null ? `${evaluation.affordability_ratio_pct}% of income` : "—"}</p>
            <p className="text-xs text-muted-foreground">{AFFORD[evaluation.affordability_tier] ?? evaluation.affordability_tier}</p>
            {evaluation.demonstrated_housing_cents != null && <p className="text-xs text-success">Proven housing payment {formatZAR(evaluation.demonstrated_housing_cents)}/mo</p>}
          </div>
          <div className="rounded border border-border p-3">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="font-medium">{CONF[evaluation.confidence_tier] ?? evaluation.confidence_tier}</p>
            <p className="text-xs text-muted-foreground">Evidence backing the income</p>
          </div>
        </div>

        {positives.map((f) => <p key={f.key} className="text-xs text-success">✓ {f.title}</p>)}

        {signals.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Agent signals — not shown to the applicant</p>
            <ul className="space-y-1">{signals.map((f) => <li key={f.key} className={`text-xs ${SEV[f.severity] ?? ""}`}>• {f.title}</li>)}</ul>
          </div>
        )}

        {todos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Open items the applicant can fix</p>
            <ul className="space-y-1">{todos.map((f) => <li key={f.key} className={`text-xs ${SEV[f.severity] ?? ""}`}>• {f.title}</li>)}</ul>
          </div>
        )}

        {recon && (
          <div className="pt-2 border-t border-border space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Evidence reconciliation</p>
            {recon.declaredSources.map((s) => (
              <div key={s.source_key} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="capitalize">{s.status}{s.evidenced_monthly_cents != null ? ` · ${formatZAR(s.evidenced_monthly_cents)}/mo` : ""}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Identity (name / ID)</span><span>{recon.identity.name} / {recon.identity.idNumber}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Net pay vs salary credit</span><span>{recon.netPayVsCredit.verdict}{recon.netPayVsCredit.gap_pct != null ? ` (${recon.netPayVsCredit.gap_pct}%)` : ""}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Statement recency</span><span>{recon.recency.monthsCovered.length} mo{recon.recency.consecutive ? " · consecutive" : " · gaps"}{recon.recency.mostRecentWithinDays != null ? ` · newest ${recon.recency.mostRecentWithinDays}d` : ""}</span></div>
          </div>
        )}

        {fraud.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-danger mb-1">Document-integrity signals</p>
            <ul className="space-y-1">{fraud.map((f) => <li key={`${f.type}-${f.documentPath}`} className="text-xs text-warning">• {f.description}</li>)}</ul>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
          Iteration {evaluation.iteration_number} · {evaluation.ruling_version} / {evaluation.reconciler_version} · {evaluation.generated_at.slice(0, 16).replace("T", " ")}
        </p>
      </div>
    </DetailCard>
  )
}
