"use client"

/**
 * app/(dashboard)/settings/import/_components/Step0Upload.tsx — File upload step for portfolio import wizard
 *
 * Auth:   gateway (dashboard layout)
 * Data:   file read client-side; /api/import/analyse for column detection; GL parser for TPN reports
 */
import { useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, CheckCircle2, Loader2 } from "lucide-react"
import { InlineLink } from "@/components/ui/actions"
import type { AnalysisResult } from "../page"
import type { GLPropertyBlock } from "@/lib/import/parseGLReport"

interface Step0UploadProps {
  onAnalysed: (analysis: AnalysisResult, headers: string[], rows: Record<string, string>[]) => void
  onGlDetected?: (blocks: GLPropertyBlock[], filename: string) => void
}

export function Step0Upload({ onAnalysed, onGlDetected }: Readonly<Step0UploadProps>) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["csv", "xlsx"].includes(ext)) {
      setError("Only CSV and Excel (.xlsx) files are supported.")
      return
    }
    const ALLOWED_MIME = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""]
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      setError("Invalid file type. Please upload a .csv or .xlsx file.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.")
      return
    }
    if (file.size === 0) {
      setError("File is empty.")
      return
    }

    setError(null)
    setLoading(true)

    try {
      let headers: string[] = []
      let rows: Record<string, string>[] = []

      if (ext === "csv") {
        const Papa = (await import("papaparse")).default
        const text = await file.text()
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, comments: "#" })
        headers = result.meta.fields ?? []
        rows = result.data
      } else {
        const XLSX = await import("xlsx")
        const { nonEmptySheetNames } = await import("@/lib/import/xlsxSheets")
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: "array" })

        // A multi-tab workbook is a relational table SET, not one sheet — reading tab 1 and dropping the rest
        // silently discards data (ADDENDUM_21C §0.2, report-honesty fail-open). Multi-table import (the assembler)
        // is not built yet, so HALT rather than import tab 1 alone. Blank spacer tabs do not count.
        const dataSheets = nonEmptySheetNames(workbook, XLSX)
        if (dataSheets.length > 1) {
          setError(
            `This workbook has ${dataSheets.length} tabs with data (${dataSheets.join(", ")}). A multi-tab export ` +
            `is a set of related tables — importing only the first would silently drop the rest. Multi-table ` +
            `import isn't available yet: please upload one table at a time (a single-tab workbook, or a CSV).`,
          )
          setLoading(false)
          return
        }
        const sheet = workbook.Sheets[dataSheets[0] ?? workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" })
        if (jsonData.length > 0) {
          rows = jsonData

          // THE HEADER ROW, READ FROM THE SHEET — not `Object.keys(jsonData[0])`.
          //
          // SheetJS DISAMBIGUATES duplicate column names: a file with two columns called "Email" comes back as
          // keys ["Email", "Email_1"]. So Object.keys() shows NO duplicate, the duplicate-header guard never
          // fires, and the second column's data is parked under a key nothing maps — silently dropped, on the
          // file type agencies most commonly upload. (The CSV path is fine: papaparse preserves duplicates.)
          //
          // Reading row 1 of the sheet gives the header row as the agency actually wrote it, duplicates and all,
          // which is the only thing the guard can act on.
          const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })[0] ?? []
          headers = headerRow.map((h) => String(h).trim()).filter((h) => h.length > 0)
        }
      }

      if (headers.length === 0) {
        setError("No columns found in the file. Is it empty?")
        setLoading(false)
        return
      }

      // Check if this is a TPN GL report (has Property1, TransDate, Debit, Credit columns)
      const lowerHeaders = headers.map((h) => h.toLowerCase().trim())
      const isGlReport = lowerHeaders.includes("property1") &&
        lowerHeaders.includes("transdate") &&
        (lowerHeaders.includes("debit") || lowerHeaders.includes("credit"))

      if (isGlReport && onGlDetected) {
        const { parseGLCsv } = await import("@/lib/import/parseGLReport")
        const text = await file.text()
        const blocks = parseGLCsv(text)
        if (blocks.length > 0) {
          onGlDetected(blocks, file.name)
          return
        }
      }

      // Send headers + sample to analyse endpoint
      const sampleRows = rows.slice(0, 5)
      const res = await fetch("/api/import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, headers, sampleRows }),
      })

      if (!res.ok) {
        setError("Failed to analyse file. Please try again.")
        setLoading(false)
        return
      }

      const analysis = await res.json()
      onAnalysed(analysis as AnalysisResult, headers, rows)
    } catch {
      setError("Failed to read file. Please check the format and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="font-heading text-2xl mb-2">Import your portfolio</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Upload your tenant and property data. We&apos;ll detect what&apos;s in it automatically.
      </p>

      {/* Dropzone */}
      <Card
        className={`border-dashed cursor-pointer transition-colors ${
          dragActive ? "border-brand bg-brand/5" : "border-border/60 hover:border-brand/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <CardContent className="py-12 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 text-brand animate-spin" />
              <p className="text-sm text-muted-foreground">Reading your file...</p>
            </div>
          ) : (
            <>
              <Upload className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Drop your CSV or Excel file here, or click to browse</p>
              <p className="text-xs text-muted-foreground">.csv or .xlsx — max 10MB</p>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {error && (
        <p className="text-sm text-danger mt-3">{error}</p>
      )}

      {/* Hints */}
      <div className="mt-6 space-y-2">
        {[
          "Works with exports from any property management system or Excel",
          "One file is enough — we detect tenants, units, and leases automatically",
          "Nothing is imported until you review and confirm",
        ].map((hint) => (
          <div key={hint} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-green-500 mt-0.5 shrink-0" />
            <span>{hint}</span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Starting fresh with no data?{" "}
        <InlineLink href="/templates/pleks_import_template.xlsx">Download blank template</InlineLink>
      </p>
    </div>
  )
}
