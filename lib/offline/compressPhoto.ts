"use client"

/**
 * Client-side photo compression for inspection captures.
 *
 * Critical order of operations:
 *  1. Extract GPS + timestamp from EXIF BEFORE compression
 *     (canvas.toBlob strips all EXIF metadata)
 *  2. Compress to 1920×1440 working copy (70% JPEG, ~300KB)
 *  3. Generate 400×300 thumbnail (60% JPEG, ~30KB)
 *  4. Discard original — 10MB camera file never touches IndexedDB
 */

export interface PhotoMetadata {
  gpsLat: number | null
  gpsLng: number | null
  capturedAt: string        // ISO from EXIF, or file.lastModified fallback
  originalSizeBytes: number // audit: "compressed from 10.2MB"
}

export interface PreparedPhoto {
  working: Blob    // 1920×1440 @ 70% JPEG — stored, uploaded, used in reports
  thumbnail: Blob  // 400×300 @ 60% JPEG — UI previews, comparison grid
  metadata: PhotoMetadata
}

// ── Minimal JPEG EXIF parser (GPS + DateTime only, no dependencies) ───────────

interface RawExif {
  gpsLat: number | null
  gpsLng: number | null
  capturedAt: string | null
}

function readRational(view: DataView, offset: number, le: boolean): number {
  const num = view.getUint32(offset, le)
  const den = view.getUint32(offset + 4, le)
  return den === 0 ? 0 : num / den
}

interface GpsState {
  latRef: string
  lngRef: string
  latRat: [number, number, number] | null
  lngRat: [number, number, number] | null
}

function readThreeRationals(view: DataView, tiffStart: number, entryOffset: number, le: boolean): [number, number, number] | null {
  const abs = tiffStart + view.getUint32(entryOffset + 8, le)
  if (abs + 24 > view.byteLength) return null
  return [readRational(view, abs, le), readRational(view, abs + 8, le), readRational(view, abs + 16, le)]
}

function applyGpsEntry(view: DataView, tiffStart: number, entryOffset: number, le: boolean, state: GpsState): void {
  const tag = view.getUint16(entryOffset, le)
  if (tag === 0x0001) state.latRef = String.fromCodePoint(view.getUint8(entryOffset + 8))
  else if (tag === 0x0002) state.latRat = readThreeRationals(view, tiffStart, entryOffset, le)
  else if (tag === 0x0003) state.lngRef = String.fromCodePoint(view.getUint8(entryOffset + 8))
  else if (tag === 0x0004) state.lngRat = readThreeRationals(view, tiffStart, entryOffset, le)
}

function dmsToDecimal(rat: [number, number, number], ref: string, negRef: string): number {
  return (rat[0] + rat[1] / 60 + rat[2] / 3600) * (ref === negRef ? -1 : 1)
}

function readGpsIfd(
  view: DataView,
  tiffStart: number,
  gpsOffset: number,
  le: boolean,
): { lat: number | null; lng: number | null } {
  const base = tiffStart + gpsOffset
  if (base + 2 > view.byteLength) return { lat: null, lng: null }

  const count = view.getUint16(base, le)
  const state: GpsState = { latRef: "N", lngRef: "E", latRat: null, lngRat: null }

  for (let i = 0; i < count; i++) {
    const e = base + 2 + i * 12
    if (e + 12 > view.byteLength) break
    applyGpsEntry(view, tiffStart, e, le, state)
  }

  return {
    lat: state.latRat ? dmsToDecimal(state.latRat, state.latRef, "S") : null,
    lng: state.lngRat ? dmsToDecimal(state.lngRat, state.lngRef, "W") : null,
  }
}

function readIfd0(
  view: DataView,
  tiffStart: number,
  ifd0Offset: number,
  le: boolean,
): { gpsOffset: number | null; dateTime: string | null } {
  const base = tiffStart + ifd0Offset
  if (base + 2 > view.byteLength) return { gpsOffset: null, dateTime: null }

  const count = view.getUint16(base, le)
  let gpsOffset: number | null = null
  let dateTime: string | null = null

  for (let i = 0; i < count; i++) {
    const e = base + 2 + i * 12
    if (e + 12 > view.byteLength) break
    const tag = view.getUint16(e, le)

    if (tag === 0x0132) {
      // DateTime ASCII "YYYY:MM:DD HH:MM:SS\0" — always offset-based (20 chars > 4)
      const strCount = view.getUint32(e + 4, le)
      const strStart = tiffStart + view.getUint32(e + 8, le)
      if (strCount > 4 && strStart + strCount <= view.byteLength) {
        let s = ""
        for (let c = 0; c < strCount - 1; c++) s += String.fromCodePoint(view.getUint8(strStart + c))
        // "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS"
        dateTime = s.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T")
      }
    } else if (tag === 0x8825) {
      gpsOffset = view.getUint32(e + 8, le)
    }
  }

  return { gpsOffset, dateTime }
}

function parseJpegExif(buffer: ArrayBuffer): RawExif {
  const fallback: RawExif = { gpsLat: null, gpsLng: null, capturedAt: null }
  try {
    const view = new DataView(buffer)
    if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return fallback

    let pos = 2
    while (pos + 4 <= view.byteLength) {
      const marker = view.getUint16(pos)
      const segLen = view.getUint16(pos + 2)

      if (
        marker === 0xffe1 &&
        pos + 10 <= view.byteLength &&
        view.getUint8(pos + 4) === 0x45 && // E
        view.getUint8(pos + 5) === 0x78 && // x
        view.getUint8(pos + 6) === 0x69 && // i
        view.getUint8(pos + 7) === 0x66 && // f
        view.getUint8(pos + 8) === 0x00 &&
        view.getUint8(pos + 9) === 0x00
      ) {
        const tiffStart = pos + 10
        if (tiffStart + 8 > view.byteLength) return fallback
        const le = view.getUint16(tiffStart) === 0x4949 // "II" = little-endian
        if (view.getUint16(tiffStart + 2, le) !== 42) return fallback

        const ifd0Offset = view.getUint32(tiffStart + 4, le)
        const { gpsOffset, dateTime } = readIfd0(view, tiffStart, ifd0Offset, le)

        let lat: number | null = null
        let lng: number | null = null
        if (gpsOffset !== null) {
          const gps = readGpsIfd(view, tiffStart, gpsOffset, le)
          lat = gps.lat
          lng = gps.lng
        }
        return { gpsLat: lat, gpsLng: lng, capturedAt: dateTime }
      }

      if ((marker & 0xff00) !== 0xff00) break
      pos += 2 + segLen
    }
  } catch {
    // Parse errors are non-fatal — fall back to defaults
  }
  return fallback
}

// ── Canvas compression ────────────────────────────────────────────────────────

async function compressToCanvas(
  source: File | Blob,
  maxWidth: number,
  maxHeight: number,
  quality: number,
): Promise<Blob> {
  const img = new Image()
  const url = URL.createObjectURL(source)
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Image load failed"))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }

  const origW = img.naturalWidth
  const origH = img.naturalHeight
  const scale = Math.min(1, maxWidth / origW, maxHeight / origH)
  const w = Math.round(origW * scale)
  const h = Math.round(origH * scale)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(img, 0, 0, w, h)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("canvas.toBlob failed"))
      },
      "image/jpeg",
      quality,
    )
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compress and prepare a raw camera file before storing or uploading:
 *  - Extracts EXIF GPS + timestamp BEFORE compression (canvas strips EXIF)
 *  - Returns 1920×1440 working copy (~300KB) and 400×300 thumbnail (~30KB)
 *  - Original file is not stored anywhere after this call
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  // Read only the first 128KB for EXIF — APP1 is always within the first segment
  const slice = await file.slice(0, 131072).arrayBuffer()
  const exif = parseJpegExif(slice)

  // Compress both sizes in parallel (independent canvas operations)
  const [working, thumbnail] = await Promise.all([
    compressToCanvas(file, 1920, 1440, 0.7),
    compressToCanvas(file, 400, 300, 0.6),
  ])

  return {
    working,
    thumbnail,
    metadata: {
      gpsLat: exif.gpsLat,
      gpsLng: exif.gpsLng,
      capturedAt: exif.capturedAt ?? new Date(file.lastModified).toISOString(),
      originalSizeBytes: file.size,
    },
  }
}
