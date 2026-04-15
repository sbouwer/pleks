"use client"

/**
 * Full-screen sign-off flow for mobile inspections.
 *
 * Steps:
 *   1. agent   — full-screen landscape canvas, agent draws signature
 *   2. handoff — brief screen between parties ("hand to tenant")
 *   3. tenant  — full-screen landscape canvas, tenant draws signature
 *   4. complete — confirmation + download sign-off image
 *
 * The sign-off image is a composited JPEG (A4 landscape): both signatures
 * side-by-side with inspection header and confirmation footer. It is
 * also uploaded to /api/inspection/[id]/signature as "sign_off".
 */

import { useRef, useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { generateSignOffImage } from "@/lib/inspection/generateSignOffImage"

type Step = "agent" | "handoff" | "tenant" | "complete"

interface Props {
  inspectionId: string
  inspectionType: string
  unitLabel: string
  scheduledDate: string | null
  agentName?: string
  onComplete: () => void
  onClose: () => void
}

// ── Signature canvas ──────────────────────────────────────────────────────────

interface CanvasProps {
  label: string
  subLabel?: string
  onConfirm: (blob: Blob) => Promise<void>
  confirmLabel: string
}

function SignatureCanvas({ label, subLabel, onConfirm, confirmLabel }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [saving, setSaving] = useState(false)
  const drawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // Size canvas to fill its container
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const { width, height } = container.getBoundingClientRect()
      // Preserve drawn content across resize by re-drawing (we clear instead — signatures are quick to redo)
      canvas.width = Math.floor(width * window.devicePixelRatio)
      canvas.height = Math.floor(height * window.devicePixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext("2d")!
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const pos = getPos(e)
    lastPos.current = pos
    setHasStrokes(true)
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext("2d")!
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const pos = getPos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111827"
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    lastPos.current = pos
  }

  function handlePointerUp() {
    drawing.current = false
  }

  function handleClear() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio)
    setHasStrokes(false)
  }

  const handleConfirm = useCallback(async () => {
    const canvas = canvasRef.current!
    setSaving(true)
    try {
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Canvas empty")); return }
          onConfirm(blob).then(resolve).catch(reject)
        }, "image/png")
      })
    } finally {
      setSaving(false)
    }
  }, [onConfirm])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
          {subLabel && <p className="text-sm text-gray-600 mt-0.5">{subLabel}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasStrokes || saving}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 text-gray-600 active:bg-gray-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasStrokes || saving}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40",
              "bg-gray-900 text-white active:bg-gray-700"
            )}
          >
            {saving ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white">
        {!hasStrokes && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Draw signature here</p>
          </div>
        )}
        {/* Bottom guideline */}
        <div className="absolute bottom-12 left-10 right-10 border-b border-dashed border-gray-300 pointer-events-none" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  )
}

// ── Handoff screen ────────────────────────────────────────────────────────────

function HandoffScreen({ onReady }: { onReady: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center gap-6 px-8 select-none">
      <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-white text-xl font-semibold">Hand device to tenant</p>
        <p className="text-gray-400 text-sm mt-2">Agent signature captured. The tenant needs to sign next.</p>
      </div>
      <button
        type="button"
        onClick={onReady}
        className="mt-4 w-full max-w-xs py-4 rounded-2xl bg-white text-gray-900 font-semibold text-base active:bg-gray-100"
      >
        I&apos;m ready to sign
      </button>
    </div>
  )
}

// ── Complete screen ───────────────────────────────────────────────────────────

function CompleteScreen({
  downloadUrl,
  filename,
  onClose,
}: {
  downloadUrl: string
  filename: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-5 px-8 select-none">
      <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
        <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-gray-900 text-xl font-semibold">Both signatures captured</p>
        <p className="text-gray-500 text-sm mt-1">Inspection sign-off is complete.</p>
      </div>
      <a
        href={downloadUrl}
        download={filename}
        className="w-full max-w-xs py-4 rounded-2xl bg-gray-900 text-white font-semibold text-base text-center active:bg-gray-700"
      >
        Download sign-off image
      </a>
      <button
        type="button"
        onClick={onClose}
        className="w-full max-w-xs py-4 rounded-2xl border border-gray-200 text-gray-700 font-medium text-base active:bg-gray-50"
      >
        Done
      </button>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SignOffFlow({
  inspectionId,
  inspectionType,
  unitLabel,
  scheduledDate,
  agentName,
  onComplete,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>("agent")
  const [agentBlob, setAgentBlob] = useState<Blob | null>(null)
  const [downloadUrl, setDownloadUrl] = useState("")
  const [filename, setFilename] = useState("")

  const dateLabel = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })

  const uploadSignature = useCallback(async (blob: Blob, sigType: "agent" | "tenant" | "sign_off") => {
    const fd = new FormData()
    fd.append("file", blob, `${sigType}.png`)
    fd.append("sigType", sigType)
    const res = await fetch(`/api/inspection/${inspectionId}/signature`, {
      method: "POST",
      body: fd,
      credentials: "include",
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      throw new Error(data.error ?? "Upload failed")
    }
  }, [inspectionId])

  const handleAgentConfirm = useCallback(async (blob: Blob) => {
    await uploadSignature(blob, "agent")
    setAgentBlob(blob)
    setStep("handoff")
  }, [uploadSignature])

  const handleTenantConfirm = useCallback(async (blob: Blob) => {
    await uploadSignature(blob, "tenant")

    // Generate composite sign-off image
    const signOffBlob = await generateSignOffImage({
      agentBlob: agentBlob!,
      tenantBlob: blob,
      inspectionType,
      unitLabel,
      date: dateLabel,
      agentName,
    })

    // Upload composite
    try {
      await uploadSignature(signOffBlob, "sign_off")
    } catch {
      // Non-fatal — user can still download
    }

    // Create download URL
    const url = URL.createObjectURL(signOffBlob)
    const name = `sign-off-${inspectionId.slice(0, 8)}.jpg`
    setDownloadUrl(url)
    setFilename(name)
    setStep("complete")
    onComplete()
  }, [agentBlob, inspectionId, inspectionType, unitLabel, dateLabel, agentName, uploadSignature, onComplete])

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  const typeLabel = inspectionType.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

  if (step === "agent") {
    return (
      <SignatureCanvas
        label="Agent signature"
        subLabel={`${typeLabel} · ${unitLabel}`}
        confirmLabel="Done — hand to tenant →"
        onConfirm={handleAgentConfirm}
      />
    )
  }

  if (step === "handoff") {
    return <HandoffScreen onReady={() => setStep("tenant")} />
  }

  if (step === "tenant") {
    return (
      <SignatureCanvas
        label="Tenant signature"
        subLabel={`${typeLabel} · ${unitLabel}`}
        confirmLabel="Confirm signature"
        onConfirm={handleTenantConfirm}
      />
    )
  }

  return (
    <CompleteScreen
      downloadUrl={downloadUrl}
      filename={filename}
      onClose={onClose}
    />
  )
}
