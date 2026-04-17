"use client"

import { useRef, useState, useTransition, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface SignaturePadCaptureProps {
  token: string
  userId: string
  orgId: string
}

export function SignaturePadCapture({ token, userId, orgId }: SignaturePadCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Set canvas resolution for crisp drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Cap DPR at 2 — higher values produce very large payloads on high-DPI mobile
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.strokeStyle = "#1a1a1a"
      ctx.lineWidth = 2
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
    }
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      const touch = e.touches[0]
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setDrawing(true)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasStrokes(true)
  }

  function stopDraw() {
    setDrawing(false)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes) {
      toast.error("Please draw your signature first")
      return
    }
    // Use JPEG at 0.8 quality — PNG produces 3-5× larger payloads for the same signature
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8)

    startTransition(async () => {
      const { saveSignatureFromMobile } = await import("@/lib/actions/signatures")
      const result = await saveSignatureFromMobile({ token, userId, orgId, dataUrl })
      if (result.error) {
        toast.error(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-center space-y-3">
          <div className="text-4xl">✓</div>
          <p className="text-lg font-semibold">Signature captured!</p>
          <p className="text-sm text-muted-foreground">
            Return to Pleks on your desktop to confirm and save your signature.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b">
        <h1 className="text-lg font-semibold">Sign your signature</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in the box below using your finger or a stylus.
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <canvas
            ref={canvasRef}
            className="w-full border-2 border-dashed border-border rounded-xl bg-white touch-none"
            style={{ height: 180 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          <p className="text-center text-xs text-muted-foreground mt-2">
            Sign in the box above
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-6 pb-8 pt-4 border-t flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={clearCanvas}
          disabled={pending}
        >
          Clear
        </Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={!hasStrokes || pending}
        >
          {pending ? "Saving…" : "Save signature"}
        </Button>
      </div>
    </div>
  )
}
