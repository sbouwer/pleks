"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
              <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
                Upload signed document
              </Button>
            )}
            <Button variant="ghost" size="sm" render={<Link href={`/leases/new?renewal_of=${leaseId}`} />}>
              Generate renewal lease →
            </Button>
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
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="size-4 mr-1.5" />
              Download lease
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Original signed document</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowUpload(!showUpload)}
            >
              Replace document
            </Button>
            <Button variant="ghost" size="sm" render={<Link href={`/leases/new?renewal_of=${leaseId}`} />}>
              Generate renewal →
            </Button>
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
