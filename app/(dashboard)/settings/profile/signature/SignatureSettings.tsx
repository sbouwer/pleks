"use client"

/**
 * app/(dashboard)/settings/profile/signature/SignatureSettings.tsx — manage the user's signature + initial
 *
 * Route:  /settings/profile?tab=signature
 * Auth:   gateway (dashboard layout); saves via saveSignature* / removeSignature (agent write gate)
 * Data:   signature + initial (CurrentSignature) + handwriting fonts passed as props.
 * Notes:  One iconic DetailCard. Header-RIGHT carries the live actions like the rest of the app:
 *         when viewing → edit (both kinds) + delete; when capturing → Save (disk) + Cancel (X).
 *         The active capture method REGISTERS its save handler up to the header (registerSave), so all
 *         four methods (Upload · Draw · Type · QR) share one header Save — only Draw keeps a bottom Clear.
 *         The Signature/Initial toggle stays inside the card; switching kind keeps the edit session open
 *         (edit both, then save each) and prompts before discarding an unsaved capture. The agent's name
 *         pre-fills the Type method. Saved marks are black ink for documents; dark theme reverses the
 *         display (dark well + inverted-to-white mark) — see .sig-* in globals.css.
 */
import { useRef, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Save, X } from "lucide-react"
import { ActionButton, EditButton, RemoveButton } from "@/components/ui/actions"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { DetailCard } from "@/components/detail/DetailCard"
import {
  saveSignatureDataUrl, saveSignatureFile, removeSignature, createSignatureToken, checkTokenConsumed, type SignatureKind,
} from "@/lib/actions/signatures"
import type { SignatureFont } from "./signatureFonts"
import { fmtDateZA } from "@/lib/dates"

interface CurrentSignature {
  id: string
  source: string
  created_at: string
  signedUrl: string | null
}

interface Props {
  signature: CurrentSignature | null
  initial: CurrentSignature | null
  fonts: SignatureFont[]
  fontVars: string
  agentName: string
  agentInitials: string
}

type Method = "upload" | "draw" | "type" | "qr"

/** A capture method publishes this up so the header Save (disk) can drive it. */
interface SaveApi { canSave: boolean; run: () => Promise<void> }
type RegisterSave = (api: SaveApi | null) => void

const KIND_NOUN: Record<SignatureKind, string> = { signature: "signature", initial: "initial" }
const SOURCE_LABELS: Record<string, string> = {
  mouse_desktop: "drawing", typed_name: "typed name", uploaded_file: "uploaded image", qr_phone: "phone (QR)",
}
const SOURCE_TO_METHOD: Record<string, Method> = {
  mouse_desktop: "draw", typed_name: "type", uploaded_file: "upload", qr_phone: "qr",
}
const METHODS: { id: Method; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "draw", label: "Draw" },
  { id: "type", label: "Type" },
  { id: "qr", label: "QR" },
]

function formatDate(iso: string): string {
  return fmtDateZA(iso)
}

/** Register the active method's save with the header; re-registers when canSave flips, clears on unmount. */
function useRegisterSave(register: RegisterSave, canSave: boolean, run: () => Promise<void>) {
  const runRef = useRef(run)
  useEffect(() => { runRef.current = run })
  useEffect(() => {
    register({ canSave, run: () => runRef.current() })
    return () => register(null)
  }, [canSave, register])
}

// ── Draw ─────────────────────────────────────────────────────────────────────

function DrawCanvas({ kind, onSaved, onDirty, register }: Readonly<{ kind: SignatureKind; onSaved: () => void; onDirty: () => void; register: RegisterSave }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [hasStrokes, setHasStrokes] = useState(false)

  function pos(clientX: number, clientY: number) {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const r = c.getBoundingClientRect()
    return { x: (clientX - r.left) * (c.width / r.width), y: (clientY - r.top) * (c.height / r.height) }
  }
  function start(p: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    ctx.beginPath(); ctx.moveTo(p.x, p.y); lastPos.current = p; drawingRef.current = true
  }
  function move(p: { x: number; y: number }) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx || !lastPos.current) return
    ctx.strokeStyle = "#111111"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"
    ctx.lineTo(p.x, p.y); ctx.stroke(); lastPos.current = p; setHasStrokes(true); onDirty()
  }
  function stop() { drawingRef.current = false; lastPos.current = null }
  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext("2d")
    if (c && ctx) { ctx.clearRect(0, 0, c.width, c.height); setHasStrokes(false) }
  }
  async function save() {
    const c = canvasRef.current
    if (!c) return
    const r = await saveSignatureDataUrl(c.toDataURL("image/png"), "mouse_desktop", kind)
    if (r.error) toast.error(r.error); else { toast.success("Saved"); onSaved() }
  }
  useRegisterSave(register, hasStrokes, save)

  return (
    <div className="space-y-3">
      <div className="sig-surface relative overflow-hidden rounded-[var(--r-button)] border border-border">
        <canvas
          ref={canvasRef} width={760} height={200}
          className="sig-ink-invert block h-48 w-full cursor-crosshair touch-none"
          onMouseDown={(e) => start(pos(e.clientX, e.clientY))}
          onMouseMove={(e) => move(pos(e.clientX, e.clientY))}
          onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={(e) => { e.preventDefault(); start(pos(e.touches[0].clientX, e.touches[0].clientY)) }}
          onTouchMove={(e) => { e.preventDefault(); move(pos(e.touches[0].clientX, e.touches[0].clientY)) }}
          onTouchEnd={stop}
        />
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Draw your {KIND_NOUN[kind]} with your mouse or finger
          </div>
        )}
      </div>
      <ActionButton type="button" tone="secondary" size="sm" onClick={clear}>Clear</ActionButton>
    </div>
  )
}

// ── Upload / drag-drop ───────────────────────────────────────────────────────

function UploadDrop({ kind, onSaved, onDirty, register }: Readonly<{ kind: SignatureKind; onSaved: () => void; onDirty: () => void; register: RegisterSave }>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function pick(f: File) {
    if (!["image/png", "image/jpeg"].includes(f.type)) { toast.error("PNG or JPG only"); return }
    if (f.size > 500 * 1024) { toast.error("Image must be under 500 KB"); return }
    setFile(f); setPreview(URL.createObjectURL(f)); onDirty()
  }
  async function save() {
    if (!file) return
    const fd = new FormData(); fd.append("file", file)
    const r = await saveSignatureFile(fd, kind)
    if (r.error) toast.error(r.error); else { toast.success("Saved"); onSaved() }
  }
  useRegisterSave(register, !!file, save)

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pick(f)
          if (inputRef.current) inputRef.current.value = ""
        }} />
      {preview ? (
        <div className="sig-surface flex h-48 items-center justify-center rounded-[var(--r-button)] border border-border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected signature" className="sig-ink-invert max-h-[150px] object-contain" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f) }}
          className={`flex h-48 w-full items-center justify-center rounded-[var(--r-button)] border-2 border-dashed px-6 text-center text-sm transition-colors ${
            dragging ? "border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {dragging ? "Drop to upload" : "Drag & drop, or click to choose an image (PNG / JPG, max 500 KB)"}
        </button>
      )}
      {preview && (
        <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Choose a different image
        </button>
      )}
    </div>
  )
}

// ── Type (name + handwriting font, one row) ──────────────────────────────────

function TypeCapture({ kind, fonts, defaultText, onSaved, onDirty, register }: Readonly<{ kind: SignatureKind; fonts: SignatureFont[]; defaultText: string; onSaved: () => void; onDirty: () => void; register: RegisterSave }>) {
  const [name, setName] = useState(defaultText)
  const [fontId, setFontId] = useState(fonts[0]?.id ?? "")
  const font = fonts.find((f) => f.id === fontId) ?? fonts[0]

  async function save() {
    if (!name.trim() || !font) return
    const canvas = document.createElement("canvas")
    canvas.width = 760; canvas.height = 200
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    try { await document.fonts.load(`64px ${font.family}`) } catch { /* fall back to whatever's available */ }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#111111"
    ctx.font = `64px ${font.family}`
    ctx.textBaseline = "middle"
    ctx.fillText(name.trim(), 24, canvas.height / 2)
    const r = await saveSignatureDataUrl(canvas.toDataURL("image/png"), "typed_name", kind)
    if (r.error) toast.error(r.error); else { toast.success("Saved"); onSaved() }
  }
  useRegisterSave(register, !!name.trim(), save)

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <input
          type="text" value={name} onChange={(e) => { setName(e.target.value); onDirty() }} placeholder="Type your name"
          className="h-9 w-60 shrink-0 rounded-[var(--r-button)] border border-input bg-transparent px-3 text-sm transition-colors focus:border-primary focus:outline-none"
        />
        <div className="flex flex-1 gap-1.5">
          {fonts.map((f) => (
            <button key={f.id} type="button" onClick={() => { setFontId(f.id); onDirty() }} title={f.label}
              style={{ fontFamily: f.family }}
              className={`flex flex-1 items-center justify-center overflow-hidden rounded-[var(--r-button)] border px-1 text-sm leading-none transition-colors ${
                fontId === f.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
              }`}>
              {name.trim() ? name.trim().slice(0, 5) : "Abc"}
            </button>
          ))}
        </div>
      </div>
      <div className="sig-surface flex h-56 items-center overflow-hidden rounded-[var(--r-button)] border border-border px-6">
        <span className="sig-ink whitespace-nowrap text-5xl leading-normal" style={{ fontFamily: font?.family }}>
          {name.trim() || "Your name"}
        </span>
      </div>
    </div>
  )
}

// ── QR (phone capture) ───────────────────────────────────────────────────────

function QrCapture({ kind, onSaved }: Readonly<{ kind: SignatureKind; onSaved: () => void }>) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const result = await createSignatureToken(kind)
      if (cancelled) return
      if (result.error ?? !result.token) { setGenError(result.error ?? "Failed to generate QR code"); setLoading(false); return }
      const base = process.env.NEXT_PUBLIC_APP_URL ?? globalThis.location.origin
      const QRCode = await import("qrcode")
      const dataUrl = await QRCode.default.toDataURL(`${base}/sign-signature/${result.token}`, { width: 200, margin: 2 })
      if (cancelled) return
      setToken(result.token); setQrDataUrl(dataUrl); setLoading(false)
      globalThis.setTimeout(() => { if (!cancelled) setExpired(true) }, 10 * 60 * 1000)
    }
    void init()
    return () => { cancelled = true }
  }, [kind])

  useEffect(() => {
    if (!token || expired) return
    const id = globalThis.setInterval(async () => {
      const { consumed } = await checkTokenConsumed(token)
      if (consumed) { globalThis.clearInterval(id); toast.success("Captured from phone"); onSaved() }
    }, 3000)
    return () => globalThis.clearInterval(id)
  }, [token, expired, onSaved])

  if (loading) return <div className="flex h-48 items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Generating QR code…</div>
  if (genError) return <p className="flex h-48 items-center text-sm text-destructive">{genError}</p>
  if (expired) return <p className="flex h-48 items-center text-sm text-muted-foreground">QR code expired — switch methods and back to generate a new one.</p>

  return (
    <div className="flex h-48 items-center gap-5 rounded-[var(--r-button)] border border-border p-4">
      {qrDataUrl && (
        <div className="shrink-0 rounded-[var(--r-button)] bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code for phone capture" className="size-[130px]" />
        </div>
      )}
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-foreground">Sign on your phone</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Scan with your phone camera, draw your {KIND_NOUN[kind]}, then return here — it appears automatically.
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Waiting for phone…</div>
      </div>
    </div>
  )
}

// ── Toggles ──────────────────────────────────────────────────────────────────

function Segmented<T extends string>({ options, value, onChange, ariaLabel }: Readonly<{
  options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (v: T) => void; ariaLabel: string
}>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`rounded-[var(--r-button)] px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const KIND_OPTIONS: { id: SignatureKind; label: string }[] = [
  { id: "signature", label: "Signature" },
  { id: "initial", label: "Initial" },
]

// ── Header actions ───────────────────────────────────────────────────────────

function CaptureHeader({ canSave, saving, onSave, onCancel }: Readonly<{ canSave: boolean; saving: boolean; onSave: () => void; onCancel?: () => void }>) {
  return (
    <div className="flex items-center gap-1">
      {canSave && (
        <button type="button" aria-label="Save" title="Save" disabled={saving} onClick={onSave} className="pa-edit">
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        </button>
      )}
      {onCancel && (
        <button type="button" aria-label="Cancel" title="Cancel" onClick={onCancel} className="pa-edit">
          <X aria-hidden />
        </button>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function SignatureSettings({ signature, initial, fonts, fontVars, agentName, agentInitials }: Readonly<Props>) {
  const router = useRouter()
  const [kind, setKind] = useState<SignatureKind>("signature")
  const [method, setMethod] = useState<Method>("upload")
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pendingKind, setPendingKind] = useState<SignatureKind | null>(null)
  const [saveApi, setSaveApi] = useState<SaveApi | null>(null)
  const [saving, setSaving] = useState(false)

  const register = useCallback<RegisterSave>((api) => setSaveApi(api), [])
  const current = kind === "signature" ? signature : initial
  const showCapture = editing || !current

  // Stay in the edit session after saving so both marks can be set; a fresh first-time save exits to its preview.
  function onSaved() { setDirty(false); router.refresh() }
  function exitEdit() { setEditing(false); setDirty(false) }
  function startEdit() {
    if (current) setMethod(SOURCE_TO_METHOD[current.source] ?? "upload")
    setEditing(true); setDirty(false)
  }

  // Switching kind keeps the edit session open (edit both); preselect the target's saved method.
  function switchKind(k: SignatureKind) {
    setKind(k); setDirty(false)
    const target = k === "signature" ? signature : initial
    setMethod(editing && target ? (SOURCE_TO_METHOD[target.source] ?? "upload") : "upload")
  }
  function requestKind(k: SignatureKind) {
    if (k === kind) return
    if (dirty) { setPendingKind(k); return }
    switchKind(k)
  }
  function changeMethod(m: Method) { setMethod(m); setDirty(false) }

  async function handleHeaderSave() {
    if (!saveApi?.canSave || saving) return
    setSaving(true)
    try { await saveApi.run() } finally { setSaving(false) }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const r = await removeSignature(kind)
      if (r.error) toast.error(r.error); else { toast.success(`${kind === "signature" ? "Signature" : "Initial"} removed`); router.refresh() }
    } finally { setRemoving(false) }
  }

  const markDirty = useCallback(() => setDirty(true), [])

  let headerAction: React.ReactNode
  if (showCapture) {
    headerAction = <CaptureHeader canSave={!!saveApi?.canSave} saving={saving} onSave={handleHeaderSave} onCancel={editing ? exitEdit : undefined} />
  } else if (current) {
    headerAction = (
      <div className="flex items-center gap-1">
        <EditButton label="Edit signature & initial" onClick={startEdit} />
        <RemoveButton label={`Delete ${KIND_NOUN[kind]}`} disabled={removing} onClick={handleRemove} />
      </div>
    )
  }

  return (
    <DetailCard title="Signature & initial" headerAction={headerAction}>
      <div className={fontVars}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Segmented options={KIND_OPTIONS} value={kind} onChange={requestKind} ariaLabel="Signature or initial" />
          {showCapture && <Segmented options={METHODS} value={method} onChange={changeMethod} ariaLabel="Capture method" />}
        </div>
        {showCapture ? (
          <>
            {method === "upload" && <UploadDrop kind={kind} onSaved={onSaved} onDirty={markDirty} register={register} />}
            {method === "draw" && <DrawCanvas kind={kind} onSaved={onSaved} onDirty={markDirty} register={register} />}
            {method === "type" && <TypeCapture kind={kind} fonts={fonts} defaultText={kind === "signature" ? agentName : agentInitials} onSaved={onSaved} onDirty={markDirty} register={register} />}
            {method === "qr" && <QrCapture kind={kind} onSaved={onSaved} />}
          </>
        ) : (
          <div className="space-y-2">
            <div className="sig-surface flex h-48 items-center justify-center rounded-[var(--r-button)] border border-border p-4">
              {current?.signedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.signedUrl} alt={KIND_NOUN[kind]} className="sig-ink-invert max-h-[150px] object-contain" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Set via {SOURCE_LABELS[current!.source] ?? current!.source} · {formatDate(current!.created_at)}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingKind}
        onOpenChange={(o) => { if (!o) setPendingKind(null) }}
        title="Discard unsaved changes?"
        description={`Your in-progress ${KIND_NOUN[kind]} hasn't been saved. Switch anyway?`}
        variant="destructive"
        confirmLabel="Discard & switch"
        onConfirm={() => {
          if (pendingKind) switchKind(pendingKind)
          setPendingKind(null)
        }}
      />
    </DetailCard>
  )
}
