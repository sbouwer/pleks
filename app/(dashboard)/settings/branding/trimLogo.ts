/**
 * app/(dashboard)/settings/branding/trimLogo.ts — client-side logo auto-trim (canvas)
 *
 * Notes:  Crops the uniform border (transparent OR near-white padding) around a logo before upload, so a
 *         logo that arrives floating in a big white canvas fills its space in the preview + documents.
 *         Browser-only (canvas/Image) — called from BrandingForm's upload path. Returns a PNG Blob to keep
 *         any transparency; falls back to the original file on any failure or if there's nothing to trim.
 */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")) }
    img.src = url
  })
}

/** True for a pixel that's background — transparent or near-white — and so trimmable at the edges. */
function isBackground(r: number, g: number, b: number, a: number): boolean {
  return a < 10 || (r > 248 && g > 248 && b > 248)
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Bounding box of the non-background pixels. maxX < 0 ⇒ wholly background. */
function contentBounds(data: Uint8ClampedArray, w: number, h: number): Bounds {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (isBackground(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Crop the transparent/near-white border off a logo. Returns a PNG Blob, or the original on no-op/failure. */
export async function trimLogo(file: File): Promise<Blob> {
  try {
    const img = await loadImage(file)
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return file

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(img, 0, 0)

    const b = contentBounds(ctx.getImageData(0, 0, w, h).data, w, h)
    if (b.maxX < 0) return file // wholly background — leave it

    const pad = 2
    const minX = Math.max(0, b.minX - pad)
    const minY = Math.max(0, b.minY - pad)
    const cw = Math.min(w - 1, b.maxX + pad) - minX + 1
    const ch = Math.min(h - 1, b.maxY + pad) - minY + 1
    if (cw >= w && ch >= h) return file // nothing to trim

    const out = document.createElement("canvas")
    out.width = cw
    out.height = ch
    const octx = out.getContext("2d")
    if (!octx) return file
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch)

    const blob: Blob | null = await new Promise((resolve) => out.toBlob((bl) => resolve(bl), "image/png"))
    return blob ?? file
  } catch {
    return file
  }
}
