/**
 * app/(dashboard)/settings/profile/ProfilePhotoCard.tsx — agent profile photo (My profile › Personal)
 *
 * Auth:   client island; POST/DELETE /api/profile/photo (the user's own photo).
 * Data:   user_profiles.avatar_url (public org-assets URL).
 * Notes:  Opt-in marketing use — the photo appears on the public agent card when the agent lists a unit.
 */
"use client"
import { useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { User } from "lucide-react"
import { DetailCard } from "@/components/detail/DetailCard"
import { ActionButton, RemoveButton } from "@/components/ui/actions"

export function ProfilePhotoCard({ initialUrl }: Readonly<{ initialUrl: string | null }>) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("PNG or JPG only"); return }
    if (file.size > 2 * 1024 * 1024) { toast.error("Photo must be under 2 MB"); return }
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/profile/photo", { method: "POST", body })
      const json = await res.json() as { photoUrl?: string; error?: string }
      if (!res.ok || !json.photoUrl) { toast.error(json.error ?? "Upload failed"); return }
      setUrl(json.photoUrl); toast.success("Photo updated")
    } catch { toast.error("Upload failed") }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = "" }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/profile/photo", { method: "DELETE" })
      if (!res.ok) { toast.error("Could not remove photo"); return }
      setUrl(null); toast.success("Photo removed")
    } catch { toast.error("Could not remove photo") }
    finally { setBusy(false) }
  }

  return (
    <DetailCard title="Photo">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-28 items-center justify-center overflow-hidden rounded-[var(--r-button)] border border-border bg-muted/30">
          {url
            ? <Image src={url} alt="Your profile photo" width={112} height={112} className="size-full object-cover" unoptimized />
            : <User className="size-10 text-muted-foreground/50" aria-hidden />}
        </div>
        <p className="text-xs text-muted-foreground">Shown on your agent card when you list a unit. PNG or JPG, under 2 MB.</p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
        <div className="flex items-center gap-2">
          <ActionButton tone="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{url ? "Replace" : "Upload photo"}</ActionButton>
          {url && <RemoveButton label="Remove photo" onClick={remove} disabled={busy} />}
        </div>
      </div>
    </DetailCard>
  )
}
