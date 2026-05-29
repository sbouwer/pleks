"use client"

/**
 * app/(status)/status/StatusView.tsx — interactive status hero + body (CD mockup design)
 *
 * Notes:  Presentational + interactive layer over REAL Better Stack data passed from the
 *         server page. The hero heart + BPM pulse in sync with the ECGMonitor's `pleks-beat`
 *         events; "Take a pulse" boosts the trace and re-fetches live data (router.refresh).
 *         No mock data and no dev tweaks-panel — those were the mockup's scaffolding.
 */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { StatusClock } from "./StatusClock"
import { ECGMonitor, type EcgApi } from "./ECGMonitor"

type Tick = "ok" | "warn" | "down" | "none"

export interface StatusComponent {
  id: string; name: string; host: string; uptime: string
  statusLabel: string; pillClass: string; ticks: Tick[]
}
export interface StatusIncident {
  id: string; title: string; host: string; date: string; dur: string; resolved: boolean
}

interface StatusViewProps {
  overallLabel: string
  accent: string
  bpm: number
  uptimePct: string
  knownDays: number
  components: StatusComponent[]
  activeIncidents: StatusIncident[]
  recentResolved: StatusIncident[]
  olderResolved: StatusIncident[]
}

export function StatusView({
  overallLabel, accent, bpm, uptimePct, knownDays,
  components, activeIncidents, recentResolved, olderResolved,
}: Readonly<StatusViewProps>) {
  const router = useRouter()
  const heartRef = useRef<SVGSVGElement>(null)
  const bpmRef = useRef<HTMLSpanElement>(null)
  const ecgApi = useRef<EcgApi | null>(null)

  const [animate, setAnimate] = useState(true)
  const [secsAgo, setSecsAgo] = useState(0)
  const [pinging, setPinging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Reduced-motion: resolve after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setAnimate(false)
  }, [])

  // Pulse the headline heart + BPM in sync with each R-spike; reset the "last beat" counter.
  useEffect(() => {
    function onBeat() {
      const h = heartRef.current
      if (h) { h.classList.remove("beating"); void h.getBoundingClientRect(); h.classList.add("beating") }
      const b = bpmRef.current
      if (b) { b.classList.remove("tick"); void b.getBoundingClientRect(); b.classList.add("tick") }
      setSecsAgo(0)
    }
    window.addEventListener("pleks-beat", onBeat)
    return () => window.removeEventListener("pleks-beat", onBeat)
  }, [])

  useEffect(() => {
    const iv = setInterval(() => setSecsAgo(s => (s >= 99 ? 0 : s + 1)), 1000)
    return () => clearInterval(iv)
  }, [])

  function takePulse() {
    ecgApi.current?.takePulse()
    setPinging(true)
    setToast(`${components.length} components · ${overallLabel}`)
    router.refresh()
    window.setTimeout(() => setPinging(false), 900)
    window.setTimeout(() => setToast(null), 4200)
  }

  return (
    <div className="sp-root" style={{ "--sp-accent": accent } as React.CSSProperties}>
      {/* ── Hero ── */}
      <section className="sp-hero">
        <div className="sp-wrap">
          <div className="sp-eyebrow"><span className="sp-dash" />SYSTEM STATUS</div>

          <div className="sp-headline">
            <svg ref={heartRef} className="sp-heart" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21C12 21 3.8 13.7 3.8 8.4C3.8 5.5 6 4 8.1 4C10 4 11.2 5.1 12 6.3C12.8 5.1 14 4 15.9 4C18 4 20.2 5.5 20.2 8.4C20.2 13.7 12 21 12 21Z"
                fill="var(--sp-accent)" />
            </svg>
            <h1>{overallLabel}</h1>
          </div>

          <div className="sp-meta">
            <span>Updated <b><StatusClock /></b></span>
            <i className="sp-pipe" />
            <span>Refreshes every <b>60s</b> · last beat {secsAgo < 2 ? "just now" : `${secsAgo}s ago`}</span>
            <i className="sp-pipe" />
            <span>{knownDays > 0 ? `${knownDays}-day` : "Current"} uptime <b className="sp-ok" style={{ color: accent }}>{uptimePct}%</b></span>
            <button type="button" className={`sp-pulsebtn${pinging ? " busy" : ""}`} onClick={takePulse} disabled={pinging}>
              <span className="sp-pulsebtn-bar" />
              {pinging ? "Taking pulse…" : "Take a pulse"}
              <span className="sp-pulsebtn-arr">{pinging ? "↻" : "→"}</span>
            </button>
          </div>

          {/* slim live heartbeat strip — sits where the flat uptime bar used to */}
          <div className="sp-pulse">
            <div className="sp-pulse-tags">
              <span className="sp-live"><span className="sp-livedot" />LIVE</span>
              <span ref={bpmRef} className="sp-bpm">{bpm}<i>BPM</i></span>
            </div>
            <ECGMonitor accent={accent} bpm={bpm} animate={animate} apiRef={ecgApi} />
            {toast && <div className="sp-toast"><span className="sp-toast-dot" />{toast}</div>}
          </div>
          <div className="sp-pulse-hint">
            {animate ? "Hover the trace to inspect a past beat · click to take a pulse" : "Motion reduced — showing a static rhythm"}
          </div>
        </div>
      </section>

      {/* ── Components ── */}
      <section className="sp-section">
        <div className="sp-wrap">
          <div className="sp-eyebrow"><span className="sp-dash" />COMPONENTS</div>
          <div className="sp-components">
            {components.length === 0 ? (
              <p className="sp-empty">No monitor data available.</p>
            ) : components.map(c => (
              <div key={c.id} className="sp-comp">
                <div className="sp-comp-id">
                  <div className="sp-comp-name">{c.name}</div>
                  {c.host && <div className="sp-comp-host">{c.host}</div>}
                </div>
                <div className="sp-tickbar">
                  {c.ticks.map((s, i) => <span key={`${c.id}-${i}`} className={`sp-tick sp-tick-${s}`} />)}
                </div>
                <div className="sp-comp-up">{c.uptime}</div>
                <div className={`sp-comp-pill ${c.pillClass}`}><span className="sp-comp-dot" />{c.statusLabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Incidents ── */}
      <section className="sp-section sp-section-last">
        <div className="sp-wrap">
          <div className="sp-eyebrow"><span className="sp-dash" />INCIDENTS — LAST 48 HOURS</div>
          <div className="sp-incidents">
            {activeIncidents.length === 0 && recentResolved.length === 0 ? (
              <div className="sp-incident">
                <span className="sp-incident-dot" />
                <div className="sp-incident-body"><div className="sp-incident-title">No incidents in the last 48 hours</div></div>
                <div className="sp-incident-right"><div className="sp-incident-state">All clear</div></div>
              </div>
            ) : (
              <>
                {activeIncidents.map(i => <IncidentRow key={i.id} inc={i} />)}
                {recentResolved.map(i => <IncidentRow key={i.id} inc={i} />)}
              </>
            )}
          </div>

          {olderResolved.length > 0 && (
            <details className="sp-incidents-more">
              <summary>
                {olderResolved.length} earlier {olderResolved.length === 1 ? "incident" : "incidents"} (last 30 days)
                <span className="sp-more-arr" aria-hidden="true"> →</span>
              </summary>
              <div className="sp-incidents-more-list">
                {olderResolved.map(i => <IncidentRow key={i.id} inc={i} />)}
              </div>
            </details>
          )}

          <div className="sp-foot">
            <span>Times in SAST (UTC+2) · uptime by Better Stack</span>
            <span>Pleks keeps trust funds &amp; client data secured · POPIA compliant</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function IncidentRow({ inc }: Readonly<{ inc: StatusIncident }>) {
  return (
    <div className="sp-incident">
      <span className={`sp-incident-dot${inc.resolved ? "" : " sp-incident-dot--active"}`} />
      <div className="sp-incident-body">
        <div className="sp-incident-title">{inc.title}</div>
        {inc.host && <div className="sp-incident-host">{inc.host}</div>}
      </div>
      <div className="sp-incident-right">
        <div className={`sp-incident-state${inc.resolved ? "" : " sp-incident-state--active"}`}>
          {inc.resolved ? "Resolved" : "Active"}
        </div>
        <div className="sp-incident-when">{inc.date} · {inc.dur}</div>
      </div>
    </div>
  )
}
