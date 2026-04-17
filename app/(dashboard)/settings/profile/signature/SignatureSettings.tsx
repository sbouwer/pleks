"use client"

import { useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  saveSignatureDataUrl,
  saveSignatureFile,
  removeSignature,
  createSignatureToken,
  checkTokenConsumed,
} from "@/lib/actions/signatures"

type Tab = "draw" | "upload" | "type" | "qr"

interface CurrentSignature {
  id: string
  source: string
  created_at: string
  signedUrl: string | null
}

interface Props {
  currentSignature: CurrentSignature | null
}

const SOURCE_LABELS: Record<string, string> = {
  mouse_desktop: "drawing",
  typed_name: "typed name",
  uploaded_file: "uploaded image",
  qr_phone: "phone (QR)",
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

// ── Draw Tab ─────────────────────────────────────────────────────────────────

function DrawTab({ onSaved }: Readonly<{ onSaved: () => void }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function getTouchPos(e: React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function startDraw(pos: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    lastPos.current = pos
    setDrawing(true)
  }

  function draw(pos: { x: number; y: number }) {
    if (!drawing) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx || !lastPos.current) return
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasStrokes(true)
  }

  function stopDraw() {
    setDrawing(false)
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const result = await saveSignatureDataUrl(dataUrl, "mouse_desktop")
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Signature saved")
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-md overflow-hidden bg-zinc-900">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="block w-full cursor-crosshair touch-none"
          style={{ maxHeight: "200px" }}
          onMouseDown={(e) => startDraw(getPos(e))}
          onMouseMove={(e) => draw(getPos(e))}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={(e) => { e.preventDefault(); startDraw(getTouchPos(e)) }}
          onTouchMove={(e) => { e.preventDefault(); draw(getTouchPos(e)) }}
          onTouchEnd={stopDraw}
        />
      </div>
      <p className="text-xs text-muted-foreground">Draw your signature above using your mouse or finger.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || !hasStrokes}>
          {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving&hellip;</> : "Save"}
        </Button>
      </div>
    </div>
  )
}

// ── Upload Tab ────────────────────────────────────────────────────────────────

function UploadTab({ onSaved }: Readonly<{ onSaved: () => void }>) {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSizeError(null)
    setPreview(null)
    setFile(null)
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > 500 * 1024) {
      setSizeError("File exceeds 500 KB. Please choose a smaller image.")
      return
    }

    setFile(selected)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(selected)
  }

  async function handleSave() {
    if (!file) return
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const result = await saveSignatureFile(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Signature saved")
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="w-full border-2 border-dashed border-input rounded-md p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-sm text-muted-foreground">
          Click to select a PNG or JPG image (max 500 KB)
        </p>
      </button>

      {sizeError && (
        <p className="text-sm text-destructive">{sizeError}</p>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Signature preview" className="max-h-[80px] object-contain" />
      )}

      <Button type="button" size="sm" onClick={handleSave} disabled={saving || !file}>
        {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving&hellip;</> : "Save"}
      </Button>
    </div>
  )
}

// ── Type Tab ──────────────────────────────────────────────────────────────────

function TypeTab({ onSaved }: Readonly<{ onSaved: () => void }>) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!name.trim()) return
    ctx.font = "48px cursive"
    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "middle"
    ctx.fillText(name, 20, canvas.height / 2)
  }, [name])

  async function handleSave() {
    if (!name.trim()) return
    const canvas = previewCanvasRef.current
    if (!canvas) return
    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const result = await saveSignatureDataUrl(dataUrl, "typed_name")
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Signature saved")
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium" htmlFor="typed-name">
          Your name
        </label>
        <input
          id="typed-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your full name"
          className="mt-1.5 flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {name.trim() && (
        <div className="border border-border rounded-md overflow-hidden bg-zinc-900">
          <canvas
            ref={previewCanvasRef}
            width={600}
            height={120}
            className="block w-full"
            style={{ maxHeight: "120px" }}
          />
        </div>
      )}

      <Button type="button" size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving&hellip;</> : "Save"}
      </Button>
    </div>
  )
}

// ── QR Tab ────────────────────────────────────────────────────────────────────

function QrTab({ onSaved }: Readonly<{ onSaved: () => void }>) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const result = await createSignatureToken()
      if (cancelled) return
      if (result.error ?? !result.token) {
        setGenError(result.error ?? "Failed to generate QR code")
        setLoading(false)
        return
      }
      const tok = result.token
      const signUrl = `${globalThis.location.origin}/sign-signature/${tok}`
      const QRCode = await import("qrcode")
      const dataUrl = await QRCode.default.toDataURL(signUrl, { width: 200, margin: 2 })
      if (cancelled) return
      setToken(tok)
      setQrDataUrl(dataUrl)
      setLoading(false)
      globalThis.setTimeout(() => { if (!cancelled) setExpired(true) }, 10 * 60 * 1000)
    }

    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!token || expired) return
    const id = globalThis.setInterval(async () => {
      const { consumed } = await checkTokenConsumed(token)
      if (consumed) {
        globalThis.clearInterval(id)
        toast.success("Signature captured from phone")
        onSaved()
      }
    }, 3000)
    return () => globalThis.clearInterval(id)
  }, [token, expired, onSaved])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Generating QR code…
      </div>
    )
  }

  if (genError) {
    return <p className="text-sm text-destructive">{genError}</p>
  }

  if (expired) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        QR code expired. Switch to another tab and back to generate a new one.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {qrDataUrl && (
        <div className="border border-input rounded-lg p-4 inline-flex flex-col items-center gap-3 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code for phone signature" className="size-[200px]" />
          <p className="text-xs text-muted-foreground text-center max-w-[200px]">
            Scan with your phone camera, draw your signature, then return here.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Waiting for signature from phone…
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SignatureSettings({ currentSignature }: Readonly<Props>) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("draw")
  const [removing, setRemoving] = useState(false)

  function handleSaved() {
    router.refresh()
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const result = await removeSignature()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Signature removed")
        router.refresh()
      }
    } finally {
      setRemoving(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "draw",   label: "Draw" },
    { id: "upload", label: "Upload" },
    { id: "type",   label: "Type name" },
    { id: "qr",     label: "Use phone" },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">My signature</h2>
        <p className="text-sm text-muted-foreground">
          Your signature is applied to documents you generate.
        </p>
      </div>

      {/* Current signature */}
      {currentSignature && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Current signature
          </p>
          {currentSignature.signedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentSignature.signedUrl}
              alt="Current signature"
              className="max-h-[80px] object-contain"
            />
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Set via {SOURCE_LABELS[currentSignature.source] ?? currentSignature.source}
              {" · "}
              {formatDate(currentSignature.created_at)}
            </p>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              {removing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Capture tabs */}
      <div className="space-y-4">
        <p className="text-sm font-medium">
          {currentSignature ? "Replace signature" : "Add a signature"}
        </p>

        {/* Tab pills */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            const activeClass = isActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeClass}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === "draw"   && <DrawTab   onSaved={handleSaved} />}
        {activeTab === "upload" && <UploadTab onSaved={handleSaved} />}
        {activeTab === "type"   && <TypeTab   onSaved={handleSaved} />}
        {activeTab === "qr"     && <QrTab     onSaved={handleSaved} />}
      </div>
    </div>
  )
}
