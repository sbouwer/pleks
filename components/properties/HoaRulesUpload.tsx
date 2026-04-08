"use client"

import { useState, useRef } from "react"
import { Upload, FileText, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface HoaRulesUploadProps {
  managingSchemeId: string | null
  existingPath: string | null
  existingUploadedAt: string | null
}

export function HoaRulesUpload({
  managingSchemeId,
  existingPath,
  existingUploadedAt,
}: Readonly<HoaRulesUploadProps>) {
  const [currentPath, setCurrentPath] = useState(existingPath)
  const [currentUploadedAt, setCurrentUploadedAt] = useState(existingUploadedAt)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!managingSchemeId) {
    return (
      <div className="text-xs text-muted-foreground">
        Assign a managing scheme to upload conduct rules.
      </div>
    )
  }

  async function handleUpload(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted")
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large — maximum 20MB")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("schemeId", managingSchemeId!)

    const res = await fetch("/api/contractors/scheme-rules/upload", {
      method: "POST",
      body: formData,
    })
    setUploading(false)

    if (!res.ok) {
      toast.error("Upload failed — please try again")
      return
    }

    const data = await res.json() as { path: string; uploaded_at: string }
    setCurrentPath(data.path)
    setCurrentUploadedAt(data.uploaded_at)
    toast.success("Conduct rules uploaded")
  }

  async function handleRemove() {
    setRemoving(true)
    const res = await fetch(`/api/contractors/scheme-rules/upload?schemeId=${managingSchemeId}`, {
      method: "DELETE",
    })
    setRemoving(false)

    if (!res.ok) {
      toast.error("Could not remove file")
      return
    }
    setCurrentPath(null)
    setCurrentUploadedAt(null)
    toast.success("Conduct rules removed")
  }

  if (currentPath) {
    const uploadDate = currentUploadedAt
      ? new Date(currentUploadedAt).toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null

    return (
      <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface-elevated px-3 py-2.5">
        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentPath.split("/").pop()}</p>
          {uploadDate && (
            <p className="text-xs text-muted-foreground">Uploaded {uploadDate}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/contractors/scheme-rules/download?schemeId=${managingSchemeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand hover:underline flex items-center gap-0.5"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={uploading}
          >
            Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-muted-foreground hover:text-danger transition-colors"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ""
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <label
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 px-4 py-6 text-center cursor-pointer hover:border-brand/40 hover:bg-brand/5 transition-colors ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">
            {uploading ? "Uploading..." : "Drop PDF here or click to upload"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">PDF only, maximum 20MB</p>
        </div>
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ""
          }}
        />
      </label>
    </div>
  )
}

// Stub upload API (placeholder — BUILD_44 wires to Supabase Storage)
export function HoaUploadStub() {
  return (
    <Button variant="outline" size="sm" disabled>
      <Upload className="h-3.5 w-3.5 mr-1.5" />
      Upload conduct rules PDF
    </Button>
  )
}
