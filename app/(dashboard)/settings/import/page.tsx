"use client"

import { useState, useCallback } from "react"
import { Step0Upload } from "./_components/Step0Upload"
import { Step1Detected } from "./_components/Step1Detected"
import { Step2Mapping } from "./_components/Step2Mapping"
import { Step3ExpiredLeases } from "./_components/Step3ExpiredLeases"
import { Step4Confirm } from "./_components/Step4Confirm"
import { StepSuccess } from "./_components/StepSuccess"
import { GLDetected } from "./_components/GLDetected"
import { GLLeaseMatch } from "./_components/GLLeaseMatch"
import { GLReview, type GLImportResultData } from "./_components/GLReview"
import { GLSuccess } from "./_components/GLSuccess"
import { WizardStepBar } from "./_components/WizardStepBar"
import type { ColumnSuggestion } from "@/lib/import/columnMapper"
import type { GLPropertyBlock } from "@/lib/import/parseGLReport"

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
}

export interface ImportResultData {
  created: {
    tenants: number
    units: number
    leases: number
    contractors?: number
    landlords?: number
    agentInvites?: number
    bankAccounts?: number
  }
  skipped: number
  errors: Array<{ row?: number; error?: string; message?: string; [key: string]: unknown }>
  pendingLandlordLinks?: Array<{ pendingLandlordId: string; name: string; email: string }>
  agentInvites?: Array<{ email: string; role: string }>
}

type WizardStep = "upload" | "detected" | "mapping" | "expired" | "confirm" | "success"
  | "gl_detected" | "gl_lease_match" | "gl_review" | "gl_success"

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

  // GL flow state
  const [glBlocks, setGlBlocks] = useState<GLPropertyBlock[]>([])
  const [glFilename, setGlFilename] = useState("")
  const [glLeaseMatches, setGlLeaseMatches] = useState<Record<string, string>>({})
  const [glPropertyMatches, setGlPropertyMatches] = useState<Record<string, string>>({})
  const [glResult, setGlResult] = useState<GLImportResultData | null>(null)

  const isGlFlow = step.startsWith("gl_")
  const stepIndex = isGlFlow
    ? ["gl_detected", "gl_lease_match", "gl_review", "gl_success"].indexOf(step) + 1
    : STEP_ORDER.indexOf(step)

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
    setGlBlocks([])
    setGlFilename("")
    setGlLeaseMatches({})
    setGlPropertyMatches({})
    setGlResult(null)
  }, [])

  // GL file detected callback
  const handleGlDetected = useCallback((blocks: GLPropertyBlock[], filename: string) => {
    setGlBlocks(blocks)
    setGlFilename(filename)
    setStep("gl_detected")
  }, [])

  return (
    <div>
      {step !== "upload" && step !== "success" && step !== "gl_success" && (
        <WizardStepBar currentStep={stepIndex} totalSteps={isGlFlow ? 4 : 5} />
      )}

      {step === "upload" && (
        <Step0Upload onAnalysed={handleFileAnalysed} onGlDetected={handleGlDetected} />
      )}

      {step === "detected" && analysis && (
        <Step1Detected
          analysis={analysis}
          onBack={() => setStep("upload")}
          onContinue={() => {
            // Filter out Inactive rows (STATE column) if present, keep all types
            const stateCol = analysis.columnSuggestions.find((s) => s.field === "__entity_state")?.column
            if (stateCol) {
              const filtered = allRows.filter((row) => {
                const stateVal = row[stateCol]?.trim().toLowerCase()
                return !stateVal || stateVal !== "inactive"
              })
              setAllRows(filtered)
            }
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

      {/* GL flow */}
      {step === "gl_detected" && glBlocks.length > 0 && (
        <GLDetected
          blocks={glBlocks}
          filename={glFilename}
          onBack={() => setStep("upload")}
          onContinue={() => setStep("gl_lease_match")}
        />
      )}

      {step === "gl_lease_match" && glBlocks.length > 0 && (
        <GLLeaseMatch
          blocks={glBlocks}
          onBack={() => setStep("gl_detected")}
          onConfirm={(lm, pm) => {
            setGlLeaseMatches(lm)
            setGlPropertyMatches(pm)
            setStep("gl_review")
          }}
        />
      )}

      {step === "gl_review" && glBlocks.length > 0 && (
        <GLReview
          blocks={glBlocks}
          leaseMatches={glLeaseMatches}
          propertyMatches={glPropertyMatches}
          onBack={() => setStep("gl_lease_match")}
          onImportComplete={(res) => {
            setGlResult(res)
            setStep("gl_success")
          }}
        />
      )}

      {step === "gl_success" && glResult && (
        <GLSuccess result={glResult} onReset={handleReset} />
      )}
    </div>
  )
}
