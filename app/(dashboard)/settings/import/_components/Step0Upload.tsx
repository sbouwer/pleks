"use client"

import { useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import type { AnalysisResult } from "../page"

interface Step0UploadProps {
  onAnalysed: (analysis: AnalysisResult, headers: string[], rows: Record<string, string>[]) => void
}

export function Step0Upload({ onAnalysed }: Readonly<Step0UploadProps>) {
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
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.")
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
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
        headers = result.meta.fields ?? []
        rows = result.data
      } else {
        const XLSX = await import("xlsx")
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" })
        if (jsonData.length > 0) {
          headers = Object.keys(jsonData[0])
          rows = jsonData
        }
      }

      if (headers.length === 0) {
        setError("No columns found in the file. Is it empty?")
        setLoading(false)
        return
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
        <Link href="/templates/pleks_import_template.csv" className="text-brand hover:underline" download>
          Download blank template →
        </Link>
      </p>
    </div>
  )
}
