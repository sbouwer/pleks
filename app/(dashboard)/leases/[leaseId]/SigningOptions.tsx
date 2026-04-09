"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { FileSignature, PenLine, Upload, CheckCircle2 } from "lucide-react"
import { ActivationDialog } from "./ActivationDialog"
import { sendForSigning } from "@/lib/actions/leases"

interface SigningOptionsProps {
  leaseId: string
  hasGeneratedDoc: boolean
  hasExternalDoc: boolean
  hasDocusealDoc: boolean
  canProceed: boolean
  tenantName: string
  unitLabel: string
  depositAmountCents: number | null
  startDate: string | null
  rentAmountCents: number
  isUploaded?: boolean
}

export function SigningOptions({
  leaseId,
  hasGeneratedDoc,
  hasExternalDoc,
  hasDocusealDoc,
  canProceed,
  tenantName,
  unitLabel,
  depositAmountCents,
  startDate,
  rentAmountCents,
  isUploaded = false,
}: Readonly<SigningOptionsProps>) {
  const router = useRouter()

  // Path A state
  const [sendingDigital, setSendingDigital] = useState(false)

  // Path B state
  const [hasDownloaded, setHasDownloaded] = useState(false)
  const [uploadingB, setUploadingB] = useState(false)

  // Path C state
  const [showReplaceC, setShowReplaceC] = useState(false)
  const [uploadingC, setUploadingC] = useState(false)

  // Activation dialog
  const [activationOpen, setActivationOpen] = useState(false)

  const hasSignedDoc = hasExternalDoc || hasDocusealDoc

  async function handleUpload(file: File, uploaderSetter: (v: boolean) => void) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max 20MB")
      return
    }
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["pdf", "docx"].includes(ext)) {
      toast.error("PDF or DOCX only")
      return
    }
    uploaderSetter(true)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`/api/leases/${leaseId}/upload-document`, { method: "POST", body: form })
    uploaderSetter(false)
    if (res.ok) {
      toast.success("Document uploaded")
      router.refresh()
    } else {
      toast.error("Upload failed")
    }
  }

  async function handleDownload() {
    const res = await fetch(`/api/leases/${leaseId}/download-document`)
    if (!res.ok) {
      toast.error("Failed to get download link")
      return
    }
    const { url } = await res.json()
    if (url) window.open(url, "_blank")
    setHasDownloaded(true)
  }

  async function handleSendDigital() {
    if (!canProceed) return
    setSendingDigital(true)
    const result = await sendForSigning(leaseId)
    setSendingDigital(false)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Sent for signing")
      router.refresh()
    }
  }

  function handleActivated() {
    router.refresh()
  }

  // Uploaded leases: show only document upload + mark as signed
  if (isUploaded) {
    return (
      <div className="space-y-4">
        {/* Document upload / replace */}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-4">
          <div className="flex items-start gap-3 mb-3">
            <Upload className="size-5 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">Lease document</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasExternalDoc
                  ? "Document uploaded. You can replace it below."
                  : "Upload the signed lease document (optional — you can do this later)."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f, setUploadingC)
              }}
              disabled={uploadingC}
              className="max-w-xs"
            />
            {uploadingC && <span className="text-xs text-muted-foreground">Uploading…</span>}
            {hasExternalDoc && !uploadingC && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Uploaded</span>
            )}
          </div>
        </div>

        {/* Mark as signed */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          {hasExternalDoc ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium">Document on file</span>
              </div>
              {canProceed ? (
                <Button size="sm" onClick={() => setActivationOpen(true)}>
                  Mark as signed →
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Complete prerequisites above to activate</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Mark as signed once all parties have signed the lease.
              </p>
              {canProceed && (
                <Button size="sm" onClick={() => setActivationOpen(true)}>
                  Mark as signed →
                </Button>
              )}
            </>
          )}
        </div>

        <ActivationDialog
          leaseId={leaseId}
          leaseData={{ tenantName, unitLabel, depositAmountCents, startDate, rentAmountCents, debiCheckEnabled: false }}
          open={activationOpen}
          onOpenChange={setActivationOpen}
          onActivated={handleActivated}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Three signing path cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Path A — Digital signing */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <FileSignature className="size-5 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Sign digitally</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Send via DocuSeal for all parties to sign online.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleSendDigital}
              disabled={!canProceed || sendingDigital || !hasGeneratedDoc}
            >
              {sendingDigital ? "Sending…" : "Send for signing"}
            </Button>
            {!canProceed && (
              <p className="text-xs text-muted-foreground text-center">
                Complete prerequisites first
              </p>
            )}
          </CardContent>
        </Card>

        {/* Path B — Sign in person */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <PenLine className="size-5 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Sign in person</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Download the lease, sign with your tenant, then upload the signed copy.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleDownload}
              disabled={!hasGeneratedDoc}
            >
              Download lease
            </Button>
            {hasDownloaded && (
              <div className="pt-1 space-y-1.5">
                <p className="text-xs text-muted-foreground">Upload signed copy:</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f, setUploadingB)
                    }}
                    disabled={uploadingB}
                    className="max-w-full"
                  />
                  {uploadingB && (
                    <span className="text-xs text-muted-foreground shrink-0">Uploading…</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Path C — Own document */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <Upload className="size-5 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Using your own document?</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Upload a signed lease from your attorney or existing template.
                </p>
              </div>
            </div>
            {hasExternalDoc && !showReplaceC ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Document uploaded ✓
                </span>
                <button
                  onClick={() => setShowReplaceC(true)}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Replace?
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      handleUpload(f, setUploadingC)
                      setShowReplaceC(false)
                    }
                  }}
                  disabled={uploadingC}
                  className="max-w-full"
                />
                {uploadingC && (
                  <span className="text-xs text-muted-foreground shrink-0">Uploading…</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signed document status + activation */}
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        {hasSignedDoc ? (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium">Signed document on file</span>
            </div>
            {canProceed ? (
              <Button size="sm" onClick={() => setActivationOpen(true)}>
                Mark as signed →
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Complete prerequisites above to activate
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Upload or send a signed document to activate
          </p>
        )}
      </div>

      <ActivationDialog
        leaseId={leaseId}
        leaseData={{
          tenantName,
          unitLabel,
          depositAmountCents,
          startDate,
          rentAmountCents,
          debiCheckEnabled: false,
        }}
        open={activationOpen}
        onOpenChange={setActivationOpen}
        onActivated={handleActivated}
      />
    </div>
  )
}
