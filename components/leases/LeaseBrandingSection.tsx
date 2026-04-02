"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, X, Check, Upload } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"

interface BrandingData {
  orgName: string
  logoUrl: string | null
  lease_display_name: string | null
  lease_registration_number: string | null
  lease_address: string | null
  lease_phone: string | null
  lease_email: string | null
  lease_website: string | null
  lease_accent_color: string | null
}

export function LeaseBrandingSection() {
  const [data, setData] = useState<BrandingData | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [draft, setDraft] = useState<Partial<BrandingData>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/org/branding")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  function startEdit() {
    setDraft({
      lease_display_name: data?.lease_display_name ?? "",
      lease_registration_number: data?.lease_registration_number ?? "",
      lease_address: data?.lease_address ?? "",
      lease_phone: data?.lease_phone ?? "",
      lease_email: data?.lease_email ?? "",
      lease_website: data?.lease_website ?? "",
      lease_accent_color: data?.lease_accent_color ?? "",
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft({})
  }

  async function save() {
    setSaving(true)
    const res = await fetch("/api/org/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    setSaving(false)
    if (res.ok) {
      setData((prev) => prev ? { ...prev, ...draft } : prev)
      setEditing(false)
      setDraft({})
      toast.success("Branding saved")
    } else {
      toast.error("Failed to save branding")
    }
  }

  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB")
      return
    }
    setLogoUploading(true)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/org/branding/logo", { method: "POST", body: form })
    setLogoUploading(false)
    if (res.ok) {
      const updated = await res.json()
      setData((prev) => prev ? { ...prev, logoUrl: updated.logoUrl } : prev)
      toast.success("Logo uploaded")
    } else {
      toast.error("Logo upload failed")
    }
  }

  const displayName = data?.lease_display_name || data?.orgName || ""

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Lease branding</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Your logo and agency details appear on the header of every generated lease.
            </p>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {!editing ? (
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div
              className="w-16 h-16 rounded border border-border/60 bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer hover:border-brand/40 transition-colors relative overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
              title="Click to upload logo"
            >
              {data?.logoUrl ? (
                <Image src={data.logoUrl} alt="Agency logo" fill className="object-contain p-1" />
              ) : (
                <Upload className="size-5 text-muted-foreground" />
              )}
              {logoUploading && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">Uploading...</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleLogoUpload(f)
              }}
            />

            {/* Details */}
            <div className="space-y-0.5 text-sm min-w-0">
              {displayName ? (
                <p className="font-medium">{displayName}</p>
              ) : (
                <p className="text-muted-foreground italic">No display name set</p>
              )}
              {data?.lease_registration_number && (
                <p className="text-muted-foreground text-xs">Reg: {data.lease_registration_number}</p>
              )}
              {data?.lease_address && (
                <p className="text-muted-foreground text-xs">{data.lease_address}</p>
              )}
              {data?.lease_phone && (
                <p className="text-muted-foreground text-xs">{data.lease_phone}</p>
              )}
              {data?.lease_email && (
                <p className="text-muted-foreground text-xs">{data.lease_email}</p>
              )}
              {data?.lease_website && (
                <p className="text-muted-foreground text-xs">{data.lease_website}</p>
              )}
              {!displayName && !data?.lease_address && !data?.lease_phone && (
                <p className="text-xs text-muted-foreground mt-1">
                  Click Edit to add your agency details.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Agency name on lease</Label>
                <Input
                  value={draft.lease_display_name ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_display_name: e.target.value }))}
                  placeholder={data?.orgName ?? "Agency trading name"}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Registration / EAAB number</Label>
                <Input
                  value={draft.lease_registration_number ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_registration_number: e.target.value }))}
                  placeholder="EA12345 or 2023/123456/07"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Address (as shown on lease)</Label>
                <Input
                  value={draft.lease_address ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_address: e.target.value }))}
                  placeholder="123 Main Street, Cape Town, 8001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={draft.lease_phone ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_phone: e.target.value }))}
                  placeholder="021 555 1234"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  value={draft.lease_email ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_email: e.target.value }))}
                  placeholder="leases@agency.co.za"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Website</Label>
                <Input
                  value={draft.lease_website ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, lease_website: e.target.value }))}
                  placeholder="www.agency.co.za"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Accent colour (hex)</Label>
                <div className="flex gap-2">
                  <Input
                    value={draft.lease_accent_color ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, lease_accent_color: e.target.value }))}
                    placeholder="#1D4ED8"
                    className="flex-1"
                  />
                  {draft.lease_accent_color && /^#[0-9a-fA-F]{6}$/.test(draft.lease_accent_color) && (
                    <div
                      className="w-9 h-9 rounded border border-border shrink-0"
                      style={{ backgroundColor: draft.lease_accent_color }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
