"use client"

import { useState, useCallback } from "react"
import { Step0Upload } from "./_components/Step0Upload"
import { Step1Detected } from "./_components/Step1Detected"
import { Step2Mapping } from "./_components/Step2Mapping"
import { Step3ExpiredLeases } from "./_components/Step3ExpiredLeases"
import { Step4Confirm } from "./_components/Step4Confirm"
import { StepSuccess } from "./_components/StepSuccess"
import { WizardStepBar } from "./_components/WizardStepBar"
import type { ColumnSuggestion } from "@/lib/import/columnMapper"

export interface AnalysisResult {
  detectedEntities: { hasTenant: boolean; hasUnit: boolean; hasLease: boolean }
  rowCounts: { tenant: number; unit: number; lease: number }
  isTpnFormat: boolean
  columnSuggestions: ColumnSuggestion[]
  unmappedColumns: string[]
  filename: string
}

export interface ImportDecisions {
  columnMapping: Record<string, { field: string; entity: string }>
  extraColumnRouting: Record<string, string>
  expiredLeaseAction: "skip" | "import_as_expired"
  perRowOverrides: Record<number, "active" | "skip">
  typeFilter?: string[]
  stateFilter?: string[]
}

export interface ImportResultData {
  created: { tenants: number; units: number; leases: number }
  skipped: number
  errors: Array<{ row?: number; error?: string; message?: string; [key: string]: unknown }>
}

type WizardStep = "upload" | "detected" | "mapping" | "expired" | "confirm" | "success"

const STEP_ORDER: WizardStep[] = ["upload", "detected", "mapping", "expired", "confirm", "success"]

export default function ImportWizardPage() {
  const [step, setStep] = useState<WizardStep>("upload")
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [allHeaders, setAllHeaders] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [decisions, setDecisions] = useState<ImportDecisions>({
    columnMapping: {},
    extraColumnRouting: {},
    expiredLeaseAction: "skip",
    perRowOverrides: {},
  })
  const [result, setResult] = useState<ImportResultData | null>(null)

  const stepIndex = STEP_ORDER.indexOf(step)

  const handleFileAnalysed = useCallback((
    analysisData: AnalysisResult,
    headers: string[],
    rows: Record<string, string>[]
  ) => {
    setAnalysis(analysisData)
    setAllHeaders(headers)
    setAllRows(rows)
    // Pre-populate column mapping from suggestions
    const mapping: Record<string, { field: string; entity: string }> = {}
    for (const s of analysisData.columnSuggestions) {
      if (s.field) {
        mapping[s.column] = { field: s.field, entity: s.entity }
      }
    }
    setDecisions((d) => ({ ...d, columnMapping: mapping }))
    setStep("detected")
  }, [])

  const handleMappingConfirmed = useCallback((
    mapping: Record<string, { field: string; entity: string }>,
    extraRouting: Record<string, string>
  ) => {
    setDecisions((d) => ({
      ...d,
      columnMapping: mapping,
      extraColumnRouting: extraRouting,
    }))
    // Check for expired leases
    const hasLeaseEnd = Object.values(mapping).some((m) => m.field === "lease_end")
    if (hasLeaseEnd && analysis?.detectedEntities.hasLease) {
      setStep("expired")
    } else {
      setStep("confirm")
    }
  }, [analysis])

  const handleExpiredDecision = useCallback((
    action: "skip" | "import_as_expired",
    overrides: Record<number, "active" | "skip">
  ) => {
    setDecisions((d) => ({
      ...d,
      expiredLeaseAction: action,
      perRowOverrides: overrides,
    }))
    setStep("confirm")
  }, [])

  const handleImportComplete = useCallback((res: ImportResultData) => {
    setResult(res)
    setStep("success")
  }, [])

  const handleReset = useCallback(() => {
    setStep("upload")
    setAllRows([])
    setAllHeaders([])
    setAnalysis(null)
    setDecisions({
      columnMapping: {},
      extraColumnRouting: {},
      expiredLeaseAction: "skip",
      perRowOverrides: {},
    })
    setResult(null)
  }, [])

  return (
    <div>
      {step !== "upload" && step !== "success" && (
        <WizardStepBar currentStep={stepIndex} totalSteps={5} />
      )}

      {step === "upload" && (
        <Step0Upload onAnalysed={handleFileAnalysed} />
      )}

      {step === "detected" && analysis && (
        <Step1Detected
          analysis={analysis}
          onBack={() => setStep("upload")}
          onContinue={(typeFilter, stateFilter) => {
            setDecisions((d) => ({ ...d, typeFilter, stateFilter }))

            // Filter rows by type/state BEFORE advancing
            let rowsToUse = allRows
            if (typeFilter && typeFilter.length > 0 && allRows.length > 0) {
              const typeCol = analysis.columnSuggestions.find((s) => s.field === "__entity_type")?.column
              const stateCol = analysis.columnSuggestions.find((s) => s.field === "__entity_state")?.column

              // Debug: log what we're looking for
              console.log("Filter debug:", { typeCol, stateCol, typeFilter, stateFilter })
              if (allRows[0]) console.log("Row keys:", Object.keys(allRows[0]))
              if (typeCol && allRows[0]) console.log("Type value in row[0]:", allRows[0][typeCol])

              if (typeCol) {
                rowsToUse = allRows.filter((row) => {
                  const typeVal = row[typeCol]?.trim()
                  if (!typeVal) return true
                  const stateVal = stateCol ? row[stateCol]?.trim() : "Active"
                  const typeMatch = typeFilter.some((t) => typeVal.toLowerCase() === t.toLowerCase())
                  const stateMatch = !stateFilter?.length || stateFilter.some((s) => stateVal?.toLowerCase() === s.toLowerCase())
                  return typeMatch && stateMatch
                })
                console.log(`Filtered: ${allRows.length} → ${rowsToUse.length} rows`)
              } else {
                console.log("No typeCol found — filter skipped")
              }
            } else {
              console.log("No typeFilter provided — all rows passed through")
            }
            setAllRows(rowsToUse)
            setStep("mapping")
          }}
        />
      )}

      {step === "mapping" && analysis && (
        <Step2Mapping
          analysis={analysis}
          headers={allHeaders}
          sampleRows={allRows.slice(0, 3)}
          initialMapping={decisions.columnMapping}
          onBack={() => setStep("detected")}
          onConfirm={handleMappingConfirmed}
        />
      )}

      {step === "expired" && (
        <Step3ExpiredLeases
          rows={allRows}
          mapping={decisions.columnMapping}
          onBack={() => setStep("mapping")}
          onConfirm={handleExpiredDecision}
        />
      )}

      {step === "confirm" && analysis && (
        <Step4Confirm
          analysis={analysis}
          rows={allRows}
          decisions={decisions}
          onBack={() => {
            const hasExpired = Object.values(decisions.columnMapping).some((m) => m.field === "lease_end")
            setStep(hasExpired ? "expired" : "mapping")
          }}
          onImportComplete={handleImportComplete}
        />
      )}

      {step === "success" && result && (
        <StepSuccess result={result} onReset={handleReset} />
      )}
    </div>
  )
}
