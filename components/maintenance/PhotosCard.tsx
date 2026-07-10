"use client"

/**
 * components/maintenance/PhotosCard.tsx — maintenance photo viewer with upload + tenant visibility toggle
 *
 * Data:   photo list + requestId passed as props from server page
 * Notes:  h-full flex-col so it matches NotesCard height in the grid row.
 *         Phase tabs in header; Add photo dialog POSTs FormData to /api/maintenance/[id]/photo.
 *         Visibility (Eye/EyeOff) toggle only shown to agents on non-terminal requests.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Image as ImageIcon, Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { ActionButton, Modal } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { togglePhotoVisibilityToTenant } from "@/lib/actions/maintenance"
import { fmtZA } from "@/lib/dates"

export interface MaintenancePhoto {
  id: string
  signedUrl: string
  caption: string | null
  photo_phase: string
  visible_to_tenant: boolean
  uploader_name: string | null
  uploaded_at: string
}

interface Props {
  requestId: string
  photos: MaintenancePhoto[]
  isReadOnly: boolean
}

const PHASE_ORDER = ["before", "during", "after"]
const PHASE_LABEL: Record<string, string> = { before: "Before", during: "During", after: "After" }

function fmtDate(iso: string): string {
  return fmtZA(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function PhotoThumb({ photo, isReadOnly }: Readonly<{ photo: MaintenancePhoto; isReadOnly: boolean }>) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggleVisibility() {
    startTransition(async () => {
      const result = await togglePhotoVisibilityToTenant(photo.id, !photo.visible_to_tenant)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="relative group">
      <a href={photo.signedUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.signedUrl}
          alt={photo.caption ?? `${photo.photo_phase} photo`}
          className="w-full aspect-square object-cover rounded-md border border-border"
        />
      </a>
      <div className="mt-1 flex items-start justify-between gap-1">
        <div className="min-w-0">
          {photo.caption && <p className="text-[10px] text-muted-foreground truncate">{photo.caption}</p>}
          <p className="text-[10px] text-muted-foreground">{fmtDate(photo.uploaded_at)}</p>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={pending}
            title={photo.visible_to_tenant ? "Hide from tenant" : "Show to tenant"}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {photo.visible_to_tenant ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

function AddPhotoDialog({ requestId }: Readonly<{ requestId: string }>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState("during")
  const [caption, setCaption] = useState("")
  const [file, setFile] = useState<File | null>(null)

  async function handleUpload() {
    if (!file) { toast.error("Select a photo first"); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("phase", phase)
      if (caption.trim()) fd.append("caption", caption.trim())

      const res = await fetch(`/api/maintenance/${requestId}/photo`, { method: "POST", body: fd })
      const json = await res.json() as { error?: string }
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Upload failed")
      } else {
        toast.success("Photo uploaded")
        setOpen(false)
        setFile(null)
        setCaption("")
        setPhase("during")
        router.refresh()
      }
    } catch {
      toast.error("Upload failed — check your connection")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <ActionButton tone="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        Add photo
      </ActionButton>
      <Modal open={open} onClose={() => setOpen(false)} title="Upload photo" icon={<ImageIcon className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Phase *</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v ?? "during")}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before</SelectItem>
                <SelectItem value="during">During</SelectItem>
                <SelectItem value="after">After</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Photo *</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm cursor-pointer"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Caption <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Burst pipe under sink"
              disabled={uploading}
              maxLength={200}
              className="text-sm"
            />
          </div>
          <ActionButton tone="primary" onClick={handleUpload} disabled={uploading || !file} className="w-full">
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {uploading ? "Uploading…" : "Upload"}
          </ActionButton>
        </div>
      </Modal>
    </>
  )
}

export function PhotosCard({ requestId, photos, isReadOnly }: Readonly<Props>) {
  const phases = PHASE_ORDER.filter(p => photos.some(ph => ph.photo_phase === p))
  const defaultPhase = phases[0] ?? "before"
  const [activePhase, setActivePhase] = useState(defaultPhase)
  const filtered = photos.filter(p => p.photo_phase === activePhase)

  return (
    <Card className="flex flex-col h-full min-h-[260px]">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Photos</CardTitle>
            {photos.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {photos.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {phases.length > 1 && phases.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setActivePhase(p)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${activePhase === p ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {PHASE_LABEL[p] ?? p}
              </button>
            ))}
            {!isReadOnly && <AddPhotoDialog requestId={requestId} />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {(() => {
          if (photos.length === 0) return <p className="text-sm text-muted-foreground">No photos attached.</p>
          if (filtered.length === 0) return <p className="text-sm text-muted-foreground">No {activePhase} photos.</p>
          return (
            <div className="grid grid-cols-3 gap-2 pr-1">
              {filtered.map(photo => (
                <PhotoThumb key={photo.id} photo={photo} isReadOnly={isReadOnly} />
              ))}
            </div>
          )
        })()}
      </CardContent>
    </Card>
  )
}
