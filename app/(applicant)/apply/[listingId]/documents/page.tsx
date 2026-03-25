"use client"

import { useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, CheckCircle2, Plus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface DocSlot {
  key: string
  label: string
  required: boolean
  accept: string
  file: File | null
  uploading: boolean
  uploaded: boolean
  storagePath: string | null
}

export default function DocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const listingId = params.listingId as string
  const applicationId = searchParams.get("application")

  const [documents, setDocuments] = useState<DocSlot[]>([
    { key: "id_document", label: "ID document", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_1", label: "Payslip 1 (most recent)", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_2", label: "Payslip 2", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_3", label: "Payslip 3", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "bank_statement", label: "Bank statement (3 months)", required: true, accept: ".pdf", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "employment_letter", label: "Employment letter / contract", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  ])

  const [optionalDocs, setOptionalDocs] = useState<DocSlot[]>([
    { key: "savings_proof", label: "Savings / Pension / Investment proof", required: false, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  ])

  const [motivation, setMotivation] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const uploaded = documents.filter((d) => d.uploaded).length
  const total = documents.length

  async function handleFileChange(index: number, list: "required" | "optional", file: File | null) {
    if (!file || !applicationId) return

    const docs = list === "required" ? documents : optionalDocs
    const setDocs = list === "required" ? setDocuments : setOptionalDocs
    const doc = docs[index]

    // Mark as uploading
    setDocs((prev) => prev.map((d, i) => (i === index ? { ...d, file, uploading: true } : d)))

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const path = `applications/${applicationId}/${doc.key}.${ext}`

      const { error } = await supabase.storage
        .from("application-docs")
        .upload(path, file, { upsert: true })

      if (error) throw error

      setDocs((prev) =>
        prev.map((d, i) =>
          i === index ? { ...d, uploading: false, uploaded: true, storagePath: path } : d
        )
      )
    } catch {
      setDocs((prev) =>
        prev.map((d, i) => (i === index ? { ...d, uploading: false } : d))
      )
      alert("Upload failed. Please try again.")
    }
  }

  async function handleSubmit() {
    if (!applicationId) return
    setSubmitting(true)

    try {
      const supabase = createClient()

      // Save motivation if provided
      if (motivation.trim()) {
        await supabase.from("applications").update({
          applicant_motivation: motivation.trim(),
          motivation_submitted_at: new Date().toISOString(),
        }).eq("id", applicationId)
      }

      // Save bank statement path for extraction
      const bankStatement = documents.find((d) => d.key === "bank_statement")
      if (bankStatement?.storagePath) {
        await supabase.from("applications").update({
          bank_statement_path: bankStatement.storagePath,
          documents_submitted: true,
          stage1_status: "documents_submitted",
        }).eq("id", applicationId)
      }

      // Trigger extraction via API
      await fetch(`/api/applications/${applicationId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankStatementPath: bankStatement?.storagePath,
          documentPaths: documents
            .filter((d) => d.storagePath)
            .map((d) => ({ key: d.key, path: d.storagePath })),
        }),
      })

      router.push(`/apply/${listingId}/status?application=${applicationId}`)
    } catch {
      alert("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Upload documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          We need a few documents to process your application.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${(uploaded / total) * 100}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {uploaded} of {total} documents
        </span>
      </div>

      {/* Required documents */}
      <Card>
        <CardHeader>
          <CardTitle>Required documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.map((doc, i) => (
            <label
              key={doc.key}
              className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              {doc.uploading ? (
                <Loader2 className="size-5 text-primary animate-spin shrink-0" />
              ) : doc.uploaded ? (
                <CheckCircle2 className="size-5 text-green-500 shrink-0" />
              ) : (
                <Upload className="size-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.file && (
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.file.name}
                  </p>
                )}
              </div>
              <input
                type="file"
                accept={doc.accept}
                capture={doc.key === "id_document" ? "environment" : undefined}
                className="sr-only"
                onChange={(e) =>
                  handleFileChange(i, "required", e.target.files?.[0] ?? null)
                }
              />
              <FileText className="size-4 text-muted-foreground shrink-0" />
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Motivation */}
      <Card>
        <CardHeader>
          <CardTitle>Motivation (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Tell the landlord why you&apos;d be a great tenant. This is optional but
            can strengthen your application.
          </p>
          <Textarea
            value={motivation}
            onChange={(e) => {
              if (e.target.value.length <= 500) setMotivation(e.target.value)
            }}
            placeholder="A few words about yourself..."
            rows={4}
          />
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={() => setMotivation("")}>
              Skip
            </Button>
            <span className="text-xs text-muted-foreground">
              {motivation.length}/500
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Optional / additional documents */}
      <Card>
        <CardHeader>
          <CardTitle>Additional documents (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {optionalDocs.map((doc, i) => (
            <label
              key={doc.key}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              {doc.uploading ? (
                <Loader2 className="size-5 text-primary animate-spin shrink-0" />
              ) : doc.uploaded ? (
                <CheckCircle2 className="size-5 text-green-500 shrink-0" />
              ) : (
                <Upload className="size-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.file && (
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.file.name}
                  </p>
                )}
              </div>
              <input
                type="file"
                accept={doc.accept}
                className="sr-only"
                onChange={(e) =>
                  handleFileChange(i, "optional", e.target.files?.[0] ?? null)
                }
              />
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Co-applicant placeholder */}
      <Button variant="outline" className="w-full h-12" disabled>
        <Plus className="size-4 mr-2" />
        Add co-applicant (coming soon)
      </Button>

      {/* Submit */}
      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        disabled={uploaded < total || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "Submitting..." : "Submit application"}
      </Button>

      {uploaded < total && (
        <p className="text-xs text-center text-muted-foreground">
          Please upload all required documents to continue.
        </p>
      )}
    </div>
  )
}
