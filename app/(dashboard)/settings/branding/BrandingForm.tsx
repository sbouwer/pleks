"use client"

/**
 * app/(dashboard)/settings/branding/BrandingForm.tsx — Document branding panel (Organisation → Branding tab)
 *
 * Route:  /settings/details?tab=branding
 * Auth:   gateway (dashboard layout)
 * Data:   /api/org/brand for load and PATCH; /api/org/brand/logo for logo upload
 * Notes:  Self-fetching client panel (no server-side load needed). Header is provided by the Organisation
 *         DetailPageLayout; the inner Setup/Preview tabs are local shadcn tabs (eslint-disabled — they are
 *         a sub-view inside the Branding tab, not a settings-category tab strip).
 */

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, Sun, Moon } from "lucide-react"
import { EditButton, RemoveButton } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"
import { toast } from "sonner"
import { DocumentPreview } from "@/components/settings/DocumentPreview"
import { trimLogo } from "./trimLogo"

/** Borderless pa-edit icon button — matches EditButton/RemoveButton for header actions (add / save). */
function HeaderIcon({ icon, label, onClick, disabled }: Readonly<{
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean
}>) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="pa-edit">
      {icon}
    </button>
  )
}

const PRESET_COLOURS = [
  // Deep / formal — line 1
  { name: "Navy", hex: "#1a3a5c" },
  { name: "Forest", hex: "#2d5016" },
  { name: "Burgundy", hex: "#6b1d1d" },
  { name: "Charcoal", hex: "#1a1a1a" },
  { name: "Royal", hex: "#3c3489" },
  { name: "Teal", hex: "#0F6E56" },
  { name: "Gold", hex: "#854F0B" },
  { name: "Terracotta", hex: "#993C1D" },
  { name: "Plum", hex: "#4a1d4a" },
  { name: "Ocean", hex: "#0e4d5c" },
  { name: "Olive", hex: "#4d531f" },
  { name: "Rose", hex: "#7a1f3d" },
  // Bright — line 2 (matching hues)
  { name: "Blue", hex: "#2563eb" },
  { name: "Green", hex: "#16a34a" },
  { name: "Red", hex: "#dc2626" },
  { name: "Slate", hex: "#64748b" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Bright teal", hex: "#14b8a6" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Orange", hex: "#f97316" },
  { name: "Violet", hex: "#a855f7" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Pink", hex: "#ec4899" },
]

type DocLayout = "classic" | "modern" | "bold" | "minimal"
type BrandFont = "inter" | "merriweather" | "lato" | "playfair"

const TEMPLATES: { id: DocLayout; name: string; description: string }[] = [
  { id: "classic", name: "Classic", description: "Centred, formal" },
  { id: "modern", name: "Modern", description: "Left-aligned, clean" },
  { id: "bold", name: "Bold", description: "Logo-dominant" },
  { id: "minimal", name: "Minimal", description: "Text-first" },
]

const FONTS: { id: BrandFont; name: string; sample: string; stack: string; description: string }[] = [
  { id: "inter", name: "Inter", sample: "Aa", stack: "var(--font-brand-inter), system-ui, sans-serif", description: "Modern · clean" },
  { id: "merriweather", name: "Merriweather", sample: "Aa", stack: "var(--font-brand-merriweather), Georgia, serif", description: "Traditional · formal" },
  { id: "lato", name: "Lato", sample: "Aa", stack: "var(--font-brand-lato), system-ui, sans-serif", description: "Friendly · approachable" },
  { id: "playfair", name: "Playfair Display", sample: "Aa", stack: "var(--font-brand-playfair), Georgia, serif", description: "Elegant · prestigious" },
]

function TemplateThumbnail({ id, accentColor }: Readonly<{ id: DocLayout; accentColor: string }>) {
  if (id === "classic") return (
    <div className="flex flex-col items-center justify-center h-10 gap-1.5 px-2">
      <div className="w-8 h-1.5 rounded-sm bg-muted-foreground/30" />
      <div className="w-12 h-px" style={{ background: accentColor, opacity: 0.6 }} />
      <div className="w-10 h-1 rounded-sm" style={{ background: accentColor, opacity: 0.7 }} />
      <div className="w-8 h-1 rounded-sm bg-muted-foreground/20" />
      <div className="w-12 h-px" style={{ background: accentColor, opacity: 0.6 }} />
    </div>
  )
  if (id === "modern") return (
    <div className="flex flex-col justify-center h-10 gap-1.5 px-3">
      <div className="w-5 h-[3px] rounded-sm" style={{ background: accentColor }} />
      <div className="w-10 h-1.5 rounded-sm bg-muted-foreground/30" />
      <div className="w-14 h-1 rounded-sm bg-muted-foreground/20" />
      <div className="w-10 h-1 rounded-sm bg-muted-foreground/20" />
    </div>
  )
  if (id === "bold") return (
    <div className="flex flex-col h-10">
      <div className="h-[3px] w-full rounded-t" style={{ background: accentColor }} />
      <div className="flex flex-col items-center justify-center flex-1 gap-1">
        <div className="w-8 h-4 rounded bg-muted-foreground/20" />
        <div className="w-10 h-1 rounded-sm" style={{ background: accentColor, opacity: 0.6 }} />
      </div>
      <div className="h-[3px] w-full rounded-b" style={{ background: accentColor }} />
    </div>
  )
  return (
    <div className="flex flex-col justify-center h-10 gap-2 px-3">
      <div className="w-14 h-2 rounded-sm bg-muted-foreground/30" />
      <div className="w-6 h-[2px] rounded-sm" style={{ background: accentColor }} />
      <div className="w-6 h-1.5 rounded-sm bg-muted-foreground/20" />
    </div>
  )
}

export function BrandingForm({ fontVars = "" }: Readonly<{ fontVars?: string }>) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [accentColor, setAccentColor] = useState("#1a3a5c")
  const [customHex, setCustomHex] = useState("#1a3a5c")
  const [template, setTemplate] = useState<DocLayout>("classic")
  const [font, setFont] = useState<BrandFont>("inter")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [logoBg, setLogoBg] = useState<"light" | "dark">("light")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const params = useSearchParams()
  const view = params.get("view") === "preview" ? "preview" : "setup"

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/org/brand")
      if (!res.ok) return
      const data = await res.json()
      setLogoUrl(data.logoUrl ?? null)
      const color = data.brand_accent_color ?? "#1a3a5c"
      setAccentColor(color)
      setCustomHex(color)
      setTemplate((data.brand_cover_template as DocLayout) ?? "classic")
      setFont((data.brand_font as BrandFont) ?? "inter")
    }
    load()
  }, [])

  async function uploadFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("PNG or JPG only"); return }
    if (file.size > 2 * 1024 * 1024) { toast.error("File must be under 2 MB"); return }
    setUploadingLogo(true)
    try {
      const trimmed = await trimLogo(file)
      const formData = new FormData()
      formData.append("file", trimmed, "logo.png")
      const res = await fetch("/api/org/brand/logo", { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        setLogoUrl(data.logoUrl ?? null)
        toast.success("Logo uploaded")
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "Upload failed")
      }
    } catch { toast.error("Upload failed") }
    finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
  }

  function handleLogoDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadFile(file)
  }

  async function handleRemoveLogo() {
    const res = await fetch("/api/org/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_logo_path: null }),
    })
    if (res.ok) { setLogoUrl(null); toast.success("Logo removed") }
    else toast.error("Failed to remove logo")
  }

  async function saveColor(hex: string) {
    const res = await fetch("/api/org/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_accent_color: hex }),
    }).catch(() => null)
    if (res?.ok) toast.success("Colour saved")
    else toast.error("Failed to save colour")
  }

  async function handleTemplateClick(id: DocLayout) {
    setTemplate(id)
    const res = await fetch("/api/org/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_cover_template: id }),
    })
    if (res.ok) toast.success("Template saved")
    else toast.error("Failed to save template")
  }

  async function handleFontClick(id: BrandFont) {
    setFont(id)
    const res = await fetch("/api/org/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_font: id }),
    })
    if (res.ok) toast.success("Font saved")
    else toast.error("Failed to save font")
  }

  if (view === "preview") {
    return (
      <div className="md:col-span-2">
        <DetailCard title="Document preview">
          <DocumentPreview logoUrl={logoUrl} accentColor={accentColor} layout={template} font={font} fontVars={fontVars} />
        </DetailCard>
      </div>
    )
  }

  return (
    <>
      <DetailCard
        title="Logo"
        headerAction={
          logoUrl ? (
            <div className="flex items-center gap-1">
              <EditButton label="Replace logo" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()} />
              <RemoveButton label="Remove logo" onClick={handleRemoveLogo} />
            </div>
          ) : (
            <HeaderIcon icon={<Plus className="size-3.5" />} label={uploadingLogo ? "Uploading…" : "Add logo"} disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()} />
          )
        }
      >
        <div className="flex h-full flex-col">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoSelect} />

          {/* Light / dark preview background toggle */}
          <div className="mb-2 flex justify-end">
            <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-0.5">
              {(["light", "dark"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={logoBg === m} onClick={() => setLogoBg(m)}
                  className={`inline-flex items-center gap-1 rounded-[var(--r-button)] px-2 py-1 text-xs font-medium transition-colors ${
                    logoBg === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {m === "light" ? <Sun className="size-3" /> : <Moon className="size-3" />}
                  {m === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleLogoDrop}
            className={`rounded transition-shadow ${dragging ? "ring-2 ring-primary ring-offset-2" : ""}`}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className={`h-24 w-full rounded border object-contain p-3 ${logoBg === "dark" ? "border-neutral-700 bg-neutral-900" : "border-border bg-white"}`} />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded border-2 border-dashed text-sm transition-colors hover:border-primary/40 ${
                  logoBg === "dark" ? "border-neutral-700 bg-neutral-900 text-neutral-400" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{dragging ? "Drop to upload" : "Drag & drop, or click to add"}</span>
              </button>
            )}
          </div>

          <p className="mt-auto pt-3 text-xs text-muted-foreground">PNG or JPG, max 2 MB.</p>
        </div>
      </DetailCard>

      <DetailCard title="Accent colour">
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-1.5">
            {PRESET_COLOURS.map((preset) => (
              <button key={preset.hex} type="button" title={preset.name}
                onClick={() => { setAccentColor(preset.hex); setCustomHex(preset.hex); void saveColor(preset.hex) }}
                className={`aspect-square w-full rounded-[var(--r-button)] transition-all ${
                  accentColor.toLowerCase() === preset.hex.toLowerCase()
                    ? "ring-2 ring-foreground/40 ring-offset-2" : "hover:scale-110"
                }`}
                style={{ backgroundColor: preset.hex }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-[var(--r-button)] border border-border" style={{ backgroundColor: accentColor }} />
            <label htmlFor="accent-hex" className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Custom hex</label>
            <input
              id="accent-hex"
              value={customHex}
              placeholder="#1a3a5c"
              onChange={(e) => {
                setCustomHex(e.target.value)
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setAccentColor(e.target.value)
              }}
              onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(customHex)) void saveColor(customHex) }}
              className="w-32 border-0 border-b border-input bg-transparent px-0 py-1.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">Used for dividers, headings, and accents across all documents.</p>
        </div>
      </DetailCard>

      <DetailCard title="Font">
        <div className={`grid grid-cols-2 gap-3 ${fontVars}`}>
          {FONTS.map((f) => {
            const active = font === f.id
            return (
              <button key={f.id} type="button" title={f.description} onClick={() => handleFontClick(f.id)}
                className={`rounded-[var(--r-button)] border-2 p-2.5 text-left transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="mb-2 flex h-10 items-center">
                  <p className="text-3xl leading-none" style={{ fontFamily: f.stack }}>{f.sample}</p>
                </div>
                <p className="text-xs font-medium leading-tight">{f.name}</p>
              </button>
            )
          })}
        </div>
      </DetailCard>

      <DetailCard title="Document layout">
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const active = template === t.id
            return (
              <button key={t.id} type="button" title={t.description} onClick={() => handleTemplateClick(t.id)}
                className={`cursor-pointer rounded-[var(--r-button)] border-2 p-2.5 text-left transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="mb-2 overflow-hidden rounded bg-muted/30">
                  <TemplateThumbnail id={t.id} accentColor={accentColor} />
                </div>
                <p className="text-xs font-medium leading-tight">{t.name}</p>
              </button>
            )
          })}
        </div>
      </DetailCard>
    </>
  )
}
