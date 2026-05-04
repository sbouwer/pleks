"use client"

/**
 * components/maintenance/PhotosCard.tsx — maintenance photo viewer with tenant visibility toggle
 *
 * Data:   photo list passed as props; calls togglePhotoVisibilityToTenant on toggle
 * Notes:  Groups photos by phase (before/during/after). Signed URLs expire — page must supply them.
 *         Visibility toggle only shown to agents (not on terminal-status requests).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { togglePhotoVisibilityToTenant } from "@/lib/actions/maintenance"

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
  photos: MaintenancePhoto[]
  isReadOnly: boolean
}

const PHASE_ORDER = ["before", "during", "after"]
const PHASE_LABEL: Record<string, string> = { before: "Before", during: "During", after: "After" }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function PhotoThumb({ photo, isReadOnly }: { photo: MaintenancePhoto; isReadOnly: boolean }) {
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

export function PhotosCard({ photos, isReadOnly }: Readonly<Props>) {
  const [activePhase, setActivePhase] = useState("before")
  const phases = PHASE_ORDER.filter(p => photos.some(ph => ph.photo_phase === p))
  const filtered = photos.filter(p => p.photo_phase === activePhase)

  if (photos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Photos</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No photos attached.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Photos</CardTitle>
            <span className="text-xs text-muted-foreground">({photos.length})</span>
          </div>
          {phases.length > 1 && (
            <div className="flex gap-1">
              {phases.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePhase(p)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${activePhase === p ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {PHASE_LABEL[p] ?? p}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {activePhase} photos.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map(photo => (
              <PhotoThumb key={photo.id} photo={photo} isReadOnly={isReadOnly} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
