"use client"

/**
 * app/(dashboard)/leases/[leaseId]/MigratedDocSection.tsx — Upload/download banner for migrated leases without a generated doc
 *
 * Route:  /leases/[leaseId] (Details tab)
 * Auth:   gateway (dashboard layout)
 * Data:   /api/leases/[leaseId]/upload-document and /api/leases/[leaseId]/download-document
 */
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { FileX, Download } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface MigratedDocSectionProps {
  leaseId: string
  externalDocPath: string | null
}

export function MigratedDocSection({
  leaseId,
  externalDocPath,
}: Readonly<MigratedDocSectionProps>) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB")
      return
    }
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["pdf", "docx"].includes(ext)) {
      toast.error("Only PDF and DOCX files are accepted")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(`/api/leases/${leaseId}/upload-document`, {
      method: "POST",
      body: formData,
    })

    setUploading(false)
    if (res.ok) {
      toast.success("Document uploaded")
      setShowUpload(false)
      router.refresh()
    } else {
      toast.error("Failed to upload document")
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
  }

  // No document uploaded yet
  if (!externalDocPath) {
    return (
      <Card className="mb-6 border-dashed border-border/60">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <FileX className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">No signed lease on file</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                This lease was migrated from another system. Upload the original
                signed document to keep a complete record.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {showUpload ? (
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                  }}
                  disabled={uploading}
                  className="max-w-xs"
                />
                {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              </div>
            ) : (
              <ActionButton tone="secondary" onClick={() => setShowUpload(true)}>
                Upload signed document
              </ActionButton>
            )}
            <InlineLink href={`/leases/new?renewal_of=${leaseId}`}>
              Generate renewal lease
            </InlineLink>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Document uploaded
  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <ActionButton tone="secondary" icon={<Download className="size-4" />} onClick={handleDownload}>
              Download lease
            </ActionButton>
            <p className="text-xs text-muted-foreground mt-1">Original signed document</p>
          </div>
          <div className="flex gap-2 items-center">
            <ActionButton tone="secondary" onClick={() => setShowUpload(!showUpload)}>
              Replace document
            </ActionButton>
            <InlineLink href={`/leases/new?renewal_of=${leaseId}`}>
              Generate renewal
            </InlineLink>
          </div>
        </div>
        {showUpload && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <Input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
              disabled={uploading}
              className="max-w-xs"
            />
            {uploading && <span className="text-xs text-muted-foreground ml-2">Uploading...</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
