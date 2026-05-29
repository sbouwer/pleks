"use client"

/**
 * app/(status)/status/ECGMonitor.tsx — live ECG heart-monitor trace for the status hero
 *
 * Notes:  Canvas PQRST sweep. Real ECG paper is amber-ruled → brand amber grid, ink trace,
 *         status-coloured glowing sweep edge, amber head dot ("now"). Each R-spike dispatches
 *         a `pleks-beat` window event so the headline heart + BPM pulse in sync; exposes
 *         { takePulse } via apiRef for the "Take a pulse" button. Colours (bg/trace/grid) are
 *         read from the live theme's CSS vars so it adapts to light/dark; `accent` (the status
 *         colour) is passed in. Ported from the CD status-page mockup (status-pulse.jsx).
 */
import { useEffect, useRef } from "react"

export interface EcgApi { takePulse: () => void }

interface ECGMonitorProps {
  accent: string          // status colour (oklch string) — the glowing sweep + head halo
  bpm: number
  animate: boolean
  apiRef: React.MutableRefObject<EcgApi | null>
}

function gauss(x: number, mu: number, s: number) { return Math.exp(-((x - mu) * (x - mu)) / (2 * s * s)) }
// Normalised PQRST beat, phase p ∈ [0,1). Signed amplitude (up positive).
function ecg(p: number) {
  return 0.135 * gauss(p, 0.165, 0.022)   // P
       + -0.13 * gauss(p, 0.236, 0.0085)  // Q
       + 1.00 * gauss(p, 0.256, 0.0075)   // R
       + -0.31 * gauss(p, 0.286, 0.011)   // S
       + 0.28 * gauss(p, 0.415, 0.033)    // T
}

function cssVar(el: Element, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

export function ECGMonitor({ accent, bpm, animate, apiRef }: Readonly<ECGMonitorProps>) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const cfg = useRef({ accent, bpm, animate })
  // Keep the rAF loop's config fresh without restarting it — update in an effect, not
  // during render (refs must not be written while rendering).
  useEffect(() => { cfg.current = { accent, bpm, animate } }, [accent, bpm, animate])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Theme colours resolved from the live CSS vars (adapts to light/dark).
    const pal = {
      bg:        cssVar(wrap, "--paper-sunk", "oklch(0.965 0.005 85)"),
      trace:     cssVar(wrap, "--ink", "oklch(0.22 0.012 260)"),
      gridMinor: `color-mix(in oklch, ${cssVar(wrap, "--amber", "oklch(0.68 0.14 65)")} 10%, transparent)`,
      gridMajor: `color-mix(in oklch, ${cssVar(wrap, "--amber", "oklch(0.68 0.14 65)")} 20%, transparent)`,
      head:      cssVar(wrap, "--amber", "oklch(0.68 0.14 65)"),
    }

    const S = {
      W: 900, H: 118, dpr: 1,
      colY: [] as number[], headCol: 0, intCol: 0, phase: 0, lastPh: 0,
      beats: [] as { col: number; t: number; no: number }[], beatNo: 1,
      boost: 0, mouseX: null as number | null, raf: 0, last: 0,
    }

    const beatLenPx = () => (210 * 60) / cfg.current.bpm
    const SPEED = 210, GAP = 26
    const amp = () => S.H * 0.30
    const baseY = () => S.H * 0.54

    function resize() {
      if (!wrap || !canvas || !ctx) return
      const r = wrap.getBoundingClientRect()
      S.W = Math.max(320, Math.round(r.width))
      S.H = Math.round(r.height) || 118
      S.dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = S.W * S.dpr; canvas.height = S.H * S.dpr
      canvas.style.width = `${S.W}px`; canvas.style.height = `${S.H}px`
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0)
      const bl0 = beatLenPx()
      S.colY = new Array(S.W)
      for (let c = 0; c < S.W; c++) S.colY[c] = ecg((((c + 6) / bl0) % 1 + 1) % 1)
      if (!cfg.current.animate) paintStatic()
    }

    function drawGrid() {
      const minor = 13, major = minor * 5
      ctx!.lineWidth = 1
      ctx!.strokeStyle = pal.gridMinor
      ctx!.beginPath()
      for (let x = 0; x <= S.W; x += minor) { ctx!.moveTo(x + 0.5, 0); ctx!.lineTo(x + 0.5, S.H) }
      for (let y = 0; y <= S.H; y += minor) { ctx!.moveTo(0, y + 0.5); ctx!.lineTo(S.W, y + 0.5) }
      ctx!.stroke()
      ctx!.strokeStyle = pal.gridMajor
      ctx!.beginPath()
      for (let x = 0; x <= S.W; x += major) { ctx!.moveTo(x + 0.5, 0); ctx!.lineTo(x + 0.5, S.H) }
      for (let y = 0; y <= S.H; y += major) { ctx!.moveTo(0, y + 0.5); ctx!.lineTo(S.W, y + 0.5) }
      ctx!.stroke()
    }

    const yAt = (c: number) => baseY() - S.colY[c] * amp()

    function strokeRange(a: number, b: number, style: string, width: number, glow: number) {
      ctx!.lineJoin = "round"; ctx!.lineCap = "round"
      ctx!.strokeStyle = style; ctx!.lineWidth = width
      if (glow) { ctx!.shadowColor = style; ctx!.shadowBlur = glow }
      ctx!.beginPath()
      let started = false
      for (let c = a; c <= b; c++) {
        const cc = ((c % S.W) + S.W) % S.W
        if (c > a && cc === 0) started = false
        const y = yAt(cc)
        if (!started) { ctx!.moveTo(cc, y); started = true } else ctx!.lineTo(cc, y)
      }
      ctx!.stroke()
      ctx!.shadowBlur = 0
    }

    function paintStatic() {
      const bl = beatLenPx()
      for (let c = 0; c < S.W; c++) S.colY[c] = ecg(((c / bl) % 1 + 1) % 1)
      ctx!.clearRect(0, 0, S.W, S.H)
      drawGrid()
      strokeRange(0, S.W - 1, pal.trace, 2.0, 0)
      strokeRange(0, S.W - 1, cfg.current.accent, 2.0, 7)
    }

    function frame(t: number) {
      if (!S.last) S.last = t
      let dt = (t - S.last) / 1000; S.last = t
      if (dt > 0.05) dt = 0.05
      if (!cfg.current.animate) { S.raf = requestAnimationFrame(frame); return }

      const acc = cfg.current.accent
      const bl = beatLenPx()
      const target = S.headCol + SPEED * dt
      while (S.intCol < Math.floor(target)) {
        S.intCol++
        const c = ((S.intCol % S.W) + S.W) % S.W
        const ph = ((S.phase % 1) + 1) % 1
        S.colY[c] = ecg(ph) * (1 + S.boost * 0.5)
        if (S.lastPh < 0.256 && ph >= 0.256) {
          S.beats.push({ col: c, t: Date.now(), no: S.beatNo++ })
          if (S.beats.length > 16) S.beats.shift()
          window.dispatchEvent(new CustomEvent("pleks-beat"))
        }
        S.lastPh = ph
        S.phase += 1 / bl
      }
      S.headCol = target
      S.boost *= Math.pow(0.06, dt)
      const head = ((Math.floor(S.headCol) % S.W) + S.W) % S.W

      ctx!.clearRect(0, 0, S.W, S.H)
      drawGrid()
      strokeRange(head + GAP, head + S.W - 1, pal.trace, 2.0, 0)
      strokeRange(head - 150, head, acc, 2.2, 9)
      ctx!.fillStyle = pal.bg; ctx!.globalAlpha = 0.9
      ctx!.fillRect(head + 1, 0, GAP, S.H); ctx!.globalAlpha = 1

      const hy = yAt(head)
      ctx!.save()
      ctx!.shadowColor = acc; ctx!.shadowBlur = 16
      ctx!.fillStyle = acc; ctx!.globalAlpha = 0.28
      ctx!.beginPath(); ctx!.arc(head, hy, 9, 0, Math.PI * 2); ctx!.fill()
      ctx!.globalAlpha = 1; ctx!.shadowBlur = 8; ctx!.fillStyle = pal.head
      ctx!.beginPath(); ctx!.arc(head, hy, 3.6, 0, Math.PI * 2); ctx!.fill()
      ctx!.restore()

      if (S.mouseX != null) {
        const mx = Math.max(0, Math.min(S.W - 1, Math.round(S.mouseX)))
        ctx!.strokeStyle = pal.trace; ctx!.globalAlpha = 0.28; ctx!.lineWidth = 1
        ctx!.setLineDash([3, 4]); ctx!.beginPath(); ctx!.moveTo(mx + 0.5, 0); ctx!.lineTo(mx + 0.5, S.H); ctx!.stroke()
        ctx!.setLineDash([]); ctx!.globalAlpha = 1
        ctx!.fillStyle = acc; ctx!.beginPath(); ctx!.arc(mx, yAt(mx), 3, 0, Math.PI * 2); ctx!.fill()
        let near: { t: number; no: number } | null = null, best = 1e9
        for (const b of S.beats) { const d = Math.abs(b.col - mx); if (d < best) { best = d; near = b } }
        const tip = tipRef.current
        if (tip && near && best < 90) {
          const dd = new Date(near.t)
          const hh = String(dd.getHours()).padStart(2, "0")
          const mm = String(dd.getMinutes()).padStart(2, "0")
          const ss = String(dd.getSeconds()).padStart(2, "0")
          tip.style.opacity = "1"
          tip.style.left = `${Math.min(S.W - 150, Math.max(8, mx + 12))}px`
          tip.innerHTML = `<b>beat #${near.no}</b> · ${hh}:${mm}:${ss}`
        } else if (tip) { tip.style.opacity = "0" }
      } else if (tipRef.current) { tipRef.current.style.opacity = "0" }

      S.raf = requestAnimationFrame(frame)
    }

    const ro = new ResizeObserver(resize); ro.observe(wrap); resize()
    S.raf = requestAnimationFrame(frame)
    if (!cfg.current.animate) paintStatic()

    const onMove = (e: PointerEvent) => { S.mouseX = e.clientX - canvas.getBoundingClientRect().left }
    const onLeave = () => { S.mouseX = null }
    const onDown = () => apiRef.current?.takePulse()
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("pointerdown", onDown)

    apiRef.current = {
      takePulse() { S.boost = 0.9; S.phase = Math.floor(S.phase) + 0.18 },
    }

    return () => {
      cancelAnimationFrame(S.raf); ro.disconnect()
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("pointerdown", onDown)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={wrapRef} className="sp-monitor-canvas-wrap">
      <canvas ref={canvasRef} className="sp-canvas" />
      <div ref={tipRef} className="sp-tip" />
    </div>
  )
}
