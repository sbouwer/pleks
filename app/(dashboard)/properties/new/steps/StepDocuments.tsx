"use client"

import { useState, useRef, type DragEvent, type ChangeEvent } from "react"
import { Upload, X, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard, type PendingDocument } from "../WizardContext"

// ── Document types ────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "title_deed",             label: "Title deed" },
  { value: "compliance_certificate", label: "Compliance certificate" },
  { value: "insurance",              label: "Insurance" },
  { value: "rates_clearance",        label: "Rates clearance" },
  { value: "levy_schedule",          label: "Levy schedule" },
  { value: "plans",                  label: "Building plans" },
  { value: "electrical_coc",         label: "Electrical CoC" },
  { value: "gas_coc",                label: "Gas CoC" },
  { value: "beetle_coc",             label: "Beetle CoC" },
  { value: "other",                  label: "Other" },
]

const COC_TYPES = new Set(["electrical_coc", "gas_coc", "beetle_coc", "compliance_certificate"])

const MAX_BYTES = 20 * 1024 * 1024  // 20 MB — matches storage bucket limit

// Filename-based heuristic (no AI; cheap and surprisingly accurate for SA conventions)
function guessDocType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes("title")) return "title_deed"
  if (lower.includes("electric")) return "electrical_coc"
  if (lower.includes("beetle")) return "beetle_coc"
  if (lower.includes("gas")) return "gas_coc"
  if (lower.includes("insurance") || lower.includes("policy")) return "insurance"
  if (lower.includes("rates")) return "rates_clearance"
  if (lower.includes("levy")) return "levy_schedule"
  if (lower.includes("plan")) return "plans"
  if (lower.includes("coc")) return "compliance_certificate"
  return "other"
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── StepDocuments ─────────────────────────────────────────────────────────────

export function StepDocuments() {
  const { state, patch } = useWizard()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [rejectedSize, setRejectedSize] = useState<string[]>([])

  function addFiles(files: FileList | File[]) {
    const next = [...state.pendingDocuments]
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        rejected.push(file.name)
        continue
      }
      next.push({ file, doc_type: guessDocType(file.name), expires_at: undefined })
    }
    patch({ pendingDocuments: next })
    setRejectedSize(rejected)
  }

  function removeAt(i: number) {
    patch({ pendingDocuments: state.pendingDocuments.filter((_, idx) => idx !== i) })
  }

  function updateDoc(i: number, partial: Partial<PendingDocument>) {
    const next = [...state.pendingDocuments]
    next[i] = { ...next[i], ...partial }
    patch({ pendingDocuments: next })
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  function onDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
    // Reset so the same file can be re-selected after removal
    e.target.value = ""
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl mb-1">Upload documents</h2>
        <p className="text-muted-foreground text-sm">
          Optional — title deed, compliance certificates, insurance docs, anything you&apos;d like
          stored alongside this property.
        </p>
      </div>

      {/* Drop zone */}
      <button
        type="button"
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30",
        )}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium mb-0.5">Drop files here, or click to browse</p>
        <p className="text-xs text-muted-foreground">PDF, JPG, PNG, DOCX — max 20MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/*"
          className="hidden"
          onChange={onFileInputChange}
        />
      </button>

      {/* Rejected for size */}
      {rejectedSize.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="font-medium mb-1">Too large to upload (20MB max):</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {rejectedSize.map((name) => <li key={name} className="text-xs">{name}</li>)}
          </ul>
        </div>
      )}

      {/* File list */}
      {state.pendingDocuments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {state.pendingDocuments.length} file{state.pendingDocuments.length === 1 ? "" : "s"} ready
          </p>
          {state.pendingDocuments.map((doc, i) => {
            const showExpiry = COC_TYPES.has(doc.doc_type)
            return (
              <div key={`${doc.file.name}-${i}`} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(doc.file.size)}</p>
                  </div>
                  <Select value={doc.doc_type} onValueChange={(v) => updateDoc(i, { doc_type: v ?? "other" })}>
                    <SelectTrigger size="sm" aria-label="Document type" className="text-xs min-w-[10rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`Remove ${doc.file.name}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {showExpiry && (
                  <div className="flex items-center gap-2 pl-6">
                    <label htmlFor={`expiry-${i}`} className="text-xs text-muted-foreground whitespace-nowrap">
                      Expiry date
                    </label>
                    <input
                      id={`expiry-${i}`}
                      type="date"
                      value={doc.expires_at ?? ""}
                      onChange={(e) => updateDoc(i, { expires_at: e.target.value || undefined })}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Files are uploaded when you save the property. You can add more from the Documents tab later.
      </p>
    </div>
  )
}
