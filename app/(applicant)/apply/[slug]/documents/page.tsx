"use client"

/**
 * Step 2: Document upload.
 * Token-authenticated — reads applicationId from token.
 * Uploads to Supabase Storage, triggers AI detection per doc.
 */

import { useState, useEffect } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from "lucide-react"

interface DocSlot {
  key: string
  label: string
  required: boolean
  accept: string
  file: File | null
  uploading: boolean
  uploaded: boolean
  storagePath: string | null
  detection?: string | null  // AI document type detection result
  error?: string | null
}

export default function DocumentsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const token = searchParams.get("token")

  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [documents, setDocuments] = useState<DocSlot[]>([
    { key: "id_document", label: "SA ID / Passport", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_1", label: "Payslip (most recent)", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_2", label: "Payslip 2", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "payslip_3", label: "Payslip 3", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "bank_statement", label: "3-month bank statement", required: true, accept: ".pdf", file: null, uploading: false, uploaded: false, storagePath: null },
    { key: "employment_letter", label: "Employment letter / contract", required: true, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  ])

  const [optionalDocs, setOptionalDocs] = useState<DocSlot[]>([
    { key: "savings_proof", label: "Savings / Investment proof (optional)", required: false, accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  ])

  // Resolve token → applicationId
  useEffect(() => {
    if (!token) { router.replace(`/apply/${slug}/details`); return }
    const supabase = createClient()
    supabase
      .from("application_tokens")
      .select("application_id, applications(org_id)")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { router.replace(`/apply/${slug}/details`); return }
        setApplicationId(data.application_id)
        const app = data.applications as unknown as { org_id: string } | null
        if (app) setOrgId(app.org_id)
        setLoading(false)
      })
  }, [token, slug, router])

  async function handleFileChange(index: number, list: "required" | "optional", file: File | null) {
    if (!file || !applicationId || !orgId) return

    const docs = list === "required" ? documents : optionalDocs
    const setDocs = list === "required" ? setDocuments : setOptionalDocs
    const doc = docs[index]

    setDocs((prev) => prev.map((d, i) => i === index ? { ...d, file, uploading: true, error: null } : d))

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const path = `applications/${orgId}/${applicationId}/${doc.key}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("application-docs")
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      // Trigger AI document detection
      let detection: string | null = null
      try {
        const res = await fetch(`/api/applications/${applicationId}/detect-document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, docKey: doc.key }),
        })
        if (res.ok) {
          const json = await res.json() as { summary?: string }
          detection = json.summary ?? null
        }
      } catch { /* detection failure is non-fatal */ }

      setDocs((prev) => prev.map((d, i) => i === index ? { ...d, uploading: false, uploaded: true, storagePath: path, detection } : d))
    } catch (err) {
      setDocs((prev) => prev.map((d, i) => i === index ? { ...d, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : d))
    }
  }

  async function handleContinue() {
    if (!applicationId) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const bankStatement = documents.find((d) => d.key === "bank_statement")

      // Update application with doc paths + status
      await supabase.from("applications").update({
        bank_statement_path: bankStatement?.storagePath ?? null,
        stage1_status: "documents_submitted",
      }).eq("id", applicationId)

      // Trigger bank statement extraction
      if (bankStatement?.storagePath) {
        void fetch(`/api/applications/${applicationId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankStatementPath: bankStatement.storagePath }),
        })
      }

      router.push(`/apply/${slug}/review?token=${token}`)
    } catch {
      alert("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  const requiredUploaded = documents.filter((d) => d.uploaded).length
  const allRequiredDone = requiredUploaded >= documents.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Step 2 of 3</p>
        <h1 className="text-xl font-semibold">Upload your documents</h1>
        <p className="text-sm text-muted-foreground mt-1">You can take a photo or upload a file.</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(requiredUploaded / documents.length) * 100}%` }} />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{requiredUploaded}/{documents.length}</span>
      </div>

      {/* Required */}
      <Card>
        <CardHeader><CardTitle>Required documents</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {documents.map((doc, i) => {
            const docErrorIcon = doc.error ? <AlertCircle className="size-5 text-destructive" /> : <Upload className="size-5 text-muted-foreground" />
            const docUploadedIcon = doc.uploaded ? <CheckCircle2 className="size-5 text-green-500" /> : docErrorIcon
            const docStatusIcon = doc.uploading ? <Loader2 className="size-5 text-primary animate-spin" /> : docUploadedIcon
            return (
            <label key={doc.key} className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="mt-0.5 shrink-0">
                {docStatusIcon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.file && <p className="text-xs text-muted-foreground truncate">{doc.file.name}</p>}
                {doc.detection && <p className="text-xs text-green-600 mt-0.5">{doc.detection}</p>}
                {doc.error && <p className="text-xs text-destructive mt-0.5">{doc.error}</p>}
              </div>
              <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <input
                type="file"
                accept={doc.accept}
                capture={doc.key === "id_document" ? "environment" : undefined}
                className="sr-only"
                onChange={(e) => handleFileChange(i, "required", e.target.files?.[0] ?? null)}
              />
            </label>
          )})}
        </CardContent>
      </Card>

      {/* Optional */}
      <Card>
        <CardHeader><CardTitle>Additional documents <span className="text-sm font-normal text-muted-foreground">(optional)</span></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {optionalDocs.map((doc, i) => {
            const optUploadedIcon = doc.uploaded ? <CheckCircle2 className="size-5 text-green-500" /> : <Upload className="size-5 text-muted-foreground" />
            const optStatusIcon = doc.uploading ? <Loader2 className="size-5 text-primary animate-spin" /> : optUploadedIcon
            return (
            <label key={doc.key} className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="mt-0.5 shrink-0">
                {optStatusIcon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{doc.label}</p>
                {doc.file && <p className="text-xs text-muted-foreground truncate">{doc.file.name}</p>}
              </div>
              <input
                type="file"
                accept={doc.accept}
                className="sr-only"
                onChange={(e) => handleFileChange(i, "optional", e.target.files?.[0] ?? null)}
              />
            </label>
          )})}
        </CardContent>
      </Card>

      <Button
        className="w-full h-12 text-base font-semibold"
        disabled={!allRequiredDone || submitting}
        onClick={handleContinue}
      >
        {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" />Saving…</> : "Next: Review →"}
      </Button>

      {!allRequiredDone && (
        <p className="text-xs text-center text-muted-foreground">Upload all {documents.length} required documents to continue.</p>
      )}
    </div>
  )
}
