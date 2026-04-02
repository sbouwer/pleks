"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { DocumentPreview } from "@/components/settings/DocumentPreview"

const PRESET_COLOURS = [
  { name: "Navy", hex: "#1a3a5c" },
  { name: "Forest", hex: "#2d5016" },
  { name: "Burgundy", hex: "#6b1d1d" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Royal", hex: "#3c3489" },
  { name: "Teal", hex: "#0F6E56" },
  { name: "Gold", hex: "#854F0B" },
  { name: "Terracotta", hex: "#993C1D" },
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
  { id: "inter", name: "Inter", sample: "Aa", stack: "Inter, sans-serif", description: "Modern · clean" },
  { id: "merriweather", name: "Merriweather", sample: "Aa", stack: "Merriweather, Georgia, serif", description: "Traditional · formal" },
  { id: "lato", name: "Lato", sample: "Aa", stack: "Lato, sans-serif", description: "Friendly · approachable" },
  { id: "playfair", name: "Playfair Display", sample: "Aa", stack: '"Playfair Display", Georgia, serif', description: "Elegant · prestigious" },
]

function TemplateThumbnail({ id, accentColor }: Readonly<{ id: DocLayout; accentColor: string }>) {
  if (id === "classic") return (
    <div className="flex flex-col items-center justify-center h-[60px] gap-1.5 px-2">
      <div className="w-8 h-1.5 rounded-sm bg-muted-foreground/30" />
      <div className="w-12 h-px" style={{ background: accentColor, opacity: 0.6 }} />
      <div className="w-10 h-1 rounded-sm" style={{ background: accentColor, opacity: 0.7 }} />
      <div className="w-8 h-1 rounded-sm bg-muted-foreground/20" />
      <div className="w-12 h-px" style={{ background: accentColor, opacity: 0.6 }} />
    </div>
  )
  if (id === "modern") return (
    <div className="flex flex-col justify-center h-[60px] gap-1.5 px-3">
      <div className="w-5 h-[3px] rounded-sm" style={{ background: accentColor }} />
      <div className="w-10 h-1.5 rounded-sm bg-muted-foreground/30" />
      <div className="w-14 h-1 rounded-sm bg-muted-foreground/20" />
      <div className="w-10 h-1 rounded-sm bg-muted-foreground/20" />
    </div>
  )
  if (id === "bold") return (
    <div className="flex flex-col h-[60px]">
      <div className="h-[3px] w-full rounded-t" style={{ background: accentColor }} />
      <div className="flex flex-col items-center justify-center flex-1 gap-1">
        <div className="w-8 h-4 rounded bg-muted-foreground/20" />
        <div className="w-10 h-1 rounded-sm" style={{ background: accentColor, opacity: 0.6 }} />
      </div>
      <div className="h-[3px] w-full rounded-b" style={{ background: accentColor }} />
    </div>
  )
  return (
    <div className="flex flex-col justify-center h-[60px] gap-2 px-3">
      <div className="w-14 h-2 rounded-sm bg-muted-foreground/30" />
      <div className="w-6 h-[2px] rounded-sm" style={{ background: accentColor }} />
      <div className="w-6 h-1.5 rounded-sm bg-muted-foreground/20" />
    </div>
  )
}

export default function BrandingPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoPatch, setLogoPatch] = useState<string | null>(null)
  const [accentColor, setAccentColor] = useState("#1a3a5c")
  const [customHex, setCustomHex] = useState("#1a3a5c")
  const [template, setTemplate] = useState<DocLayout>("classic")
  const [font, setFont] = useState<BrandFont>("inter")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [savingColor, setSavingColor] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/org/brand")
      if (!res.ok) return
      const data = await res.json()
      setLogoUrl(data.logoUrl ?? null)
      setLogoPatch(data.brand_logo_path ?? null)
      const color = data.brand_accent_color ?? "#1a3a5c"
      setAccentColor(color)
      setCustomHex(color)
      setTemplate((data.brand_cover_template as DocLayout) ?? "classic")
      setFont((data.brand_font as BrandFont) ?? "inter")
    }
    load()
  }, [])

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("PNG or JPG only"); return }
    if (file.size > 2 * 1024 * 1024) { toast.error("File must be under 2 MB"); return }
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/org/brand/logo", { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        setLogoUrl(data.logoUrl ?? null)
        setLogoPatch(data.logoPath ?? null)
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

  async function handleRemoveLogo() {
    const res = await fetch("/api/org/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_logo_path: null }),
    })
    if (res.ok) { setLogoUrl(null); setLogoPatch(null); toast.success("Logo removed") }
    else toast.error("Failed to remove logo")
  }

  async function handleSaveColor() {
    setSavingColor(true)
    try {
      const res = await fetch("/api/org/brand", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_accent_color: accentColor }),
      })
      if (res.ok) toast.success("Colour saved")
      else toast.error("Failed to save colour")
    } catch { toast.error("Failed to save colour") }
    finally { setSavingColor(false) }
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

  return (
    <div>
      <h1 className="font-heading text-3xl mb-1">Branding</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Control how your documents look. Organisation details are configured in{" "}
        <Link href="/settings/profile" className="text-brand hover:underline underline-offset-4">
          Settings &rarr; Your details
        </Link>.
      </p>

      <Tabs defaultValue="setup">
        <TabsList className="mb-6">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="preview">Document preview</TabsTrigger>
        </TabsList>

        {/* ── Setup tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="setup" className="space-y-4">
          {/* Logo + Accent colour side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Logo */}
            <Card>
              <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-4">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-28 h-16 object-contain rounded border border-border bg-muted/20" />
                  ) : (
                    <div className="w-28 h-16 rounded border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                      No logo
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoSelect} />
                    <Button variant="outline" size="sm" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()}>
                      {uploadingLogo ? "Uploading..." : "Upload logo"}
                    </Button>
                    {logoPatch && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">PNG or JPG, max 2 MB.</p>
              </CardContent>
            </Card>

            {/* Accent colour */}
            <Card>
              <CardHeader><CardTitle className="text-base">Accent colour</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLOURS.map((preset) => (
                    <button key={preset.hex} type="button" title={preset.name}
                      onClick={() => { setAccentColor(preset.hex); setCustomHex(preset.hex) }}
                      className={`w-7 h-7 rounded-full transition-all ${
                        accentColor.toLowerCase() === preset.hex.toLowerCase()
                          ? "ring-2 ring-offset-2 ring-foreground/40" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded border border-border shrink-0" style={{ backgroundColor: accentColor }} />
                  <Input placeholder="#1a3a5c" className="w-28" value={customHex}
                    onChange={(e) => {
                      setCustomHex(e.target.value)
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setAccentColor(e.target.value)
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={handleSaveColor} disabled={savingColor}>
                    {savingColor ? "Saving..." : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Used for dividers, headings, and accents across all documents.</p>
              </CardContent>
            </Card>
          </div>

          {/* Font */}
          <Card>
            <CardHeader><CardTitle className="text-base">Font</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FONTS.map((f) => {
                  const active = font === f.id
                  return (
                    <button key={f.id} type="button" onClick={() => handleFontClick(f.id)}
                      className={`border-2 rounded-lg p-3 text-left transition-colors ${
                        active ? "border-brand bg-brand/5" : "border-border hover:border-brand/40"
                      }`}
                    >
                      <p className="text-2xl mb-1.5 leading-none" style={{ fontFamily: f.stack }}>
                        {f.sample}
                      </p>
                      <p className="text-xs font-medium leading-tight">{f.name}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{f.description}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Cover page template */}
          <Card>
            <CardHeader><CardTitle className="text-base">Document layout</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TEMPLATES.map((t) => {
                  const active = template === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => handleTemplateClick(t.id)}
                      className={`border-2 rounded-lg p-3 cursor-pointer transition-colors text-left ${
                        active ? "border-brand bg-brand/5" : "border-border hover:border-brand/40"
                      }`}
                    >
                      <div className="overflow-hidden rounded bg-muted/30 mb-2">
                        <TemplateThumbnail id={t.id} accentColor={accentColor} />
                      </div>
                      <p className="text-xs font-medium leading-tight">{t.name}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">{t.description}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Preview tab ────────────────────────────────────────────────────── */}
        <TabsContent value="preview">
          <DocumentPreview logoUrl={logoUrl} accentColor={accentColor} layout={template} font={font} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
