"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { runDeterministicChecks, shouldRunAiCheck, type ClauseConflict } from "@/lib/leases/conflictChecker"
import { DEFAULT_ANNEXURE_C_RULES } from "@/components/leases/LeaseWizard"
import type { WizardData } from "../LeaseWizard"

function conflictSummaryLabel(unresolvedCount: number): string {
  if (unresolvedCount === 0) return "All conflicts acknowledged"
  const plural = unresolvedCount > 1 ? "s" : ""
  const verb = unresolvedCount === 1 ? "requires" : "require"
  return `${unresolvedCount} conflict${plural} ${verb} resolution`
}

function nextButtonTitle(unresolvedCount: number): string {
  const plural = unresolvedCount > 1 ? "s" : ""
  return `Resolve or acknowledge ${unresolvedCount} conflict${plural} before continuing`
}

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

export function ClausesStep({ data, onBack, onNext }: Readonly<Props>) {
  const [clauseSelections, setClauseSelections] = useState<Record<string, boolean>>(data.clauseSelections)
  const [deterministicConflicts, setDeterministicConflicts] = useState<ClauseConflict[]>([])
  const [aiConflicts, setAiConflicts] = useState<ClauseConflict[]>([])
  const [aiStatus, setAiStatus] = useState<"idle" | "checking" | "done" | "error">("idle")
  const [acknowledged, setAcknowledged] = useState<string[]>(data.acknowledgedConflicts)
  const abortRef = useRef<AbortController | null>(null)

  // Run deterministic checks instantly on every selection change
  useEffect(() => {
    const det = runDeterministicChecks(
      clauseSelections,
      data.annexureCRules,
      data.isSectionalTitle,
      data.parkingBays,
    )
    setDeterministicConflicts(det)

    // Clear acknowledged for conflicts that were quick-fixed (no longer present)
    const detIds = new Set(det.map((c) => c.id))
    setAcknowledged((prev) => prev.filter((id) => detIds.has(id) || id.startsWith("ai_")))
  }, [clauseSelections, data.annexureCRules, data.isSectionalTitle, data.parkingBays])

  // Trigger Sonnet check when conditions are met
  useEffect(() => {
    if (!shouldRunAiCheck(clauseSelections, data.annexureCRules, DEFAULT_ANNEXURE_C_RULES)) {
      setAiConflicts([])
      setAiStatus("idle")
      return
    }

    // Cancel any in-flight check
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setAiStatus("checking")
    const enabledClauseKeys = Object.entries(clauseSelections)
      .filter(([, v]) => v === true)
      .map(([k]) => k)

    fetch("/api/leases/conflict-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ enabledClauseKeys, annexureCRules: data.annexureCRules }),
    })
      .then((r) => r.json())
      .then(({ conflicts }) => {
        // Filter out duplicates of deterministic conflicts
        const detIds = new Set(deterministicConflicts.map((c) => c.clauseKey))
        const unique = (conflicts as ClauseConflict[]).filter((c) => !detIds.has(c.clauseKey))
        setAiConflicts(unique)
        setAiStatus("done")
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setAiStatus("error")
      })

    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clauseSelections, data.annexureCRules])

  function applyQuickFix(conflict: ClauseConflict) {
    if (conflict.quickFix?.type === "disable_clause") {
      setClauseSelections((prev) => ({ ...prev, [conflict.quickFix!.clauseKey]: false }))
    }
  }

  function acknowledge(id: string) {
    setAcknowledged((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function unacknowledge(id: string) {
    setAcknowledged((prev) => prev.filter((x) => x !== id))
  }

  const allConflicts = [...deterministicConflicts, ...aiConflicts]
  const unresolvedCount = allConflicts.filter((c) => !acknowledged.includes(c.id)).length
  const canProceed = unresolvedCount === 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Lease clauses</h2>
        <p className="text-sm text-muted-foreground">Review and configure which clauses apply to this lease.</p>
      </div>

      {/* HOA supremacy banner */}
      {data.isSectionalTitle && data.hasSchemeRules && (
        <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3">
          <Info className="size-4 text-info mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Body corporate rules are supreme</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A non-removable <strong>HOA Supremacy</strong> clause will be auto-inserted into this lease:
              where any provision conflicts with the BC Rules, the BC Rules prevail to the extent of the conflict.
              Verify optional clauses against the BC conduct rules before proceeding.
            </p>
          </div>
        </div>
      )}

      {data.isSectionalTitle && !data.hasSchemeRules && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            This property is sectional title. Assign a managing scheme in property settings to enable the BC rules supremacy clause and unlock scheme-specific conflict checking.
          </p>
        </div>
      )}

      {/* Clause configurator */}
      <ClauseConfigurator
        leaseType={data.leaseType}
        unitId={data.unitId}
        onSelectionsChange={setClauseSelections}
      />

      {/* Conflict results */}
      {allConflicts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("size-4", unresolvedCount > 0 ? "text-amber-500" : "text-success")} />
            <h3 className="text-sm font-medium">{conflictSummaryLabel(unresolvedCount)}</h3>
          </div>

          {allConflicts.map((conflict) => {
            const isAck = acknowledged.includes(conflict.id)
            return (
              <div
                key={conflict.id}
                className={cn(
                  "rounded-lg border px-4 py-3 text-sm transition-colors",
                  isAck
                    ? "border-border/40 bg-muted/20"
                    : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className={cn("font-medium text-sm", isAck ? "text-muted-foreground line-through" : "text-amber-700 dark:text-amber-400")}>
                      {conflict.title}
                    </p>
                    {!isAck && (
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">{conflict.description}</p>
                    )}
                    {isAck && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-success" /> Acknowledged — will be logged to audit trail
                      </p>
                    )}
                  </div>
                  {isAck && (
                    <button type="button" onClick={() => unacknowledge(conflict.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {!isAck && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {conflict.quickFix && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => applyQuickFix(conflict)}
                      >
                        {conflict.quickFix.label}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:text-amber-400"
                      onClick={() => acknowledge(conflict.id)}
                    >
                      <CheckCircle2 className="size-3 mr-1" /> Acknowledge risk
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* AI check status */}
      {aiStatus === "checking" && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-block size-3 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          {" Checking for additional clause conflicts…"}
        </p>
      )}
      {aiStatus === "error" && (
        <p className="text-xs text-muted-foreground">AI conflict check unavailable — deterministic checks still apply.</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button
          onClick={() => onNext({ clauseSelections, acknowledgedConflicts: acknowledged })}
          disabled={!canProceed}
          title={canProceed ? undefined : nextButtonTitle(unresolvedCount)}
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}
