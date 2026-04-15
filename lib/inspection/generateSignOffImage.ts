"use client"

/**
 * Composites both signatures and inspection details onto an A4-landscape canvas.
 * Returns a JPEG Blob suitable for download or upload.
 *
 * Layout (1754 × 1240 @ 150 dpi — A4 landscape):
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  INSPECTION SIGN-OFF                     pleks                 │  header
 *   │  Move-in · 12 Oak St, Unit 3 · 15 Apr 2026                    │
 *   ├─────────────────────────────┬──────────────────────────────────┤
 *   │  AGENT                      │  TENANT                          │
 *   │  [signature]                │  [signature]                     │
 *   │                             │                                  │
 *   ├─────────────────────────────┴──────────────────────────────────┤
 *   │  I confirm I participated in this inspection on …              │  footer
 *   └────────────────────────────────────────────────────────────────┘
 */

interface SignOffImageInput {
  agentBlob: Blob
  tenantBlob: Blob
  inspectionType: string
  unitLabel: string
  date: string        // ISO or formatted string
  agentName?: string
  tenantName?: string
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load signature image")) }
    img.src = url
  })
}

export async function generateSignOffImage(input: SignOffImageInput): Promise<Blob> {
  const W = 1754
  const H = 1240
  const HEADER_H = 140
  const FOOTER_H = 80
  const PAD = 40
  const SIG_AREA_H = H - HEADER_H - FOOTER_H

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // ── Background ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, H)

  // ── Header ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f8f9fa"
  ctx.fillRect(0, 0, W, HEADER_H)

  // Title
  ctx.fillStyle = "#111827"
  ctx.font = "bold 32px system-ui, sans-serif"
  ctx.textBaseline = "top"
  ctx.fillText("INSPECTION SIGN-OFF", PAD, PAD)

  // Subtitle
  const typeLabel = input.inspectionType.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
  const subtitle = [typeLabel, input.unitLabel, input.date].filter(Boolean).join("  ·  ")
  ctx.fillStyle = "#6b7280"
  ctx.font = "24px system-ui, sans-serif"
  ctx.fillText(subtitle, PAD, PAD + 44)

  // Logo wordmark (top right)
  ctx.fillStyle = "#111827"
  ctx.font = "bold 28px system-ui, sans-serif"
  ctx.textAlign = "right"
  ctx.fillText("pleks", W - PAD, PAD + 10)
  ctx.textAlign = "left"

  // Header bottom border
  ctx.strokeStyle = "#e5e7eb"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, HEADER_H)
  ctx.lineTo(W, HEADER_H)
  ctx.stroke()

  // ── Centre divider ────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#e5e7eb"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(W / 2, HEADER_H)
  ctx.lineTo(W / 2, H - FOOTER_H)
  ctx.stroke()

  // ── Party labels ──────────────────────────────────────────────────────────────
  const labelY = HEADER_H + 24
  ctx.fillStyle = "#6b7280"
  ctx.font = "bold 20px system-ui, sans-serif"
  ctx.fillText("AGENT", PAD, labelY)
  ctx.fillText("TENANT", W / 2 + PAD, labelY)

  if (input.agentName) {
    ctx.fillStyle = "#111827"
    ctx.font = "20px system-ui, sans-serif"
    ctx.fillText(input.agentName, PAD + 90, labelY)
  }
  if (input.tenantName) {
    ctx.fillStyle = "#111827"
    ctx.font = "20px system-ui, sans-serif"
    ctx.fillText(input.tenantName, W / 2 + PAD + 90, labelY)
  }

  // ── Signature images ──────────────────────────────────────────────────────────
  const [agentImg, tenantImg] = await Promise.all([
    loadImage(input.agentBlob),
    loadImage(input.tenantBlob),
  ])

  const sigPad = 60
  const sigTop = HEADER_H + sigPad + 20
  const sigW = W / 2 - sigPad * 2
  const sigH = SIG_AREA_H - sigPad * 2 - 20

  function drawContained(img: HTMLImageElement, x: number, y: number, maxW: number, maxH: number) {
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = x + (maxW - dw) / 2
    const dy = y + (maxH - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
  }

  drawContained(agentImg, PAD + sigPad - PAD, sigTop, sigW + PAD, sigH)
  drawContained(tenantImg, W / 2 + PAD + sigPad - PAD, sigTop, sigW + PAD, sigH)

  // Signature underlines
  const lineY = HEADER_H + SIG_AREA_H - 10
  ctx.strokeStyle = "#374151"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(PAD, lineY)
  ctx.lineTo(W / 2 - PAD, lineY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(W / 2 + PAD, lineY)
  ctx.lineTo(W - PAD, lineY)
  ctx.stroke()

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerY = H - FOOTER_H
  ctx.strokeStyle = "#e5e7eb"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, footerY)
  ctx.lineTo(W, footerY)
  ctx.stroke()

  ctx.fillStyle = "#6b7280"
  ctx.font = "18px system-ui, sans-serif"
  ctx.textBaseline = "middle"
  const footerText = `Both parties confirm they participated in this inspection on ${input.date} and agree the above represents the recorded condition.`
  ctx.fillText(footerText, PAD, footerY + FOOTER_H / 2)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Canvas toBlob failed"))
    }, "image/jpeg", 0.92)
  })
}
