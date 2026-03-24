"use client"

import { useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, CheckCircle2, Plus } from "lucide-react"

interface DocSlot {
  key: string
  label: string
  required: boolean
  accept: string
  multiple?: boolean
  file: File | null
}

export default function DocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const listingId = params.listingId as string
  const applicationId = searchParams.get("application")

  const [documents, setDocuments] = useState<DocSlot[]>([
    { key: "id_document", label: "ID document", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null },
    { key: "payslip_1", label: "Payslip 1 (most recent)", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null },
    { key: "payslip_2", label: "Payslip 2", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null },
    { key: "payslip_3", label: "Payslip 3", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null },
    { key: "bank_statement", label: "Bank statement (3 months)", required: true, accept: ".pdf", file: null },
    { key: "employment_letter", label: "Employment letter / contract", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null },
  ])

  const [optionalDocs, setOptionalDocs] = useState<DocSlot[]>([
    { key: "savings_proof", label: "Savings / Pension / Investment proof", required: false, accept: ".pdf,.jpg,.jpeg,.png", file: null },
  ])

  const [motivation, setMotivation] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const uploaded = documents.filter((d) => d.file).length
  const total = documents.length

  function handleFileChange(index: number, list: "required" | "optional", file: File | null) {
    if (list === "required") {
      setDocuments((prev) =>
        prev.map((d, i) => (i === index ? { ...d, file } : d))
      )
    } else {
      setOptionalDocs((prev) =>
        prev.map((d, i) => (i === index ? { ...d, file } : d))
      )
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    // Placeholder: would upload files to Supabase Storage and trigger extraction
    await new Promise((r) => setTimeout(r, 1500))
    router.push(`/apply/${listingId}/status?application=${applicationId}`)
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
              {doc.file ? (
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
              {doc.file ? (
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
