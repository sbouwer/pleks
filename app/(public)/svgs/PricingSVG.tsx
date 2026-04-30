/**
 * app/(public)/svgs/PricingSVG.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
export function PricingSVG() {
  const bars = [
    { x: 50,  y: 30,  h: 230, op: 0.25 },
    { x: 100, y: 60,  h: 200, op: 0.25 },
    { x: 150, y: 15,  h: 245, op: 0.5  },
    { x: 200, y: 50,  h: 210, op: 0.5  },
    { x: 250, y: 40,  h: 220, op: 0.8  },
    { x: 300, y: 55,  h: 205, op: 0.8  },
  ]
  const dotCx = [65, 115, 165, 215, 265, 315]
  const dotCy = [30,  60,  15,  50,  40,  55]

  return (
    <svg
      viewBox="0 0 400 320"
      fill="none"
      style={{
        position: "absolute", top: -72, left: "28%",
        width: "54%", height: "auto",
        pointerEvents: "none", zIndex: 0, opacity: 0.13,
        color: "var(--amber-ink)",
        maskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
      }}
      aria-hidden="true"
    >
      {/* Grid lines */}
      {[205, 150, 95, 40].map(y => (
        <line key={y} x1="30" y1={y} x2="340" y2={y} stroke="currentColor" strokeWidth="0.5"/>
      ))}
      <line x1="30" y1="260" x2="340" y2="260" stroke="currentColor" strokeWidth="1"/>
      {/* Bars */}
      {bars.map(b => (
        <rect key={b.x} x={b.x} y={b.y} width="30" height={b.h} rx="3" stroke="currentColor" strokeWidth="1.2" strokeOpacity={b.op}/>
      ))}
      {/* Trend line */}
      <polyline
        points={dotCx.map((cx, i) => `${cx},${dotCy[i]}`).join(" ")}
        stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeOpacity="0.5"
      />
      {/* Dots */}
      {dotCx.map((cx, i) => (
        <circle key={cx} cx={cx} cy={dotCy[i]} r="3" fill="currentColor" fillOpacity="0.6"/>
      ))}
      {/* Inset card */}
      <rect x="220" y="170" width="160" height="120" rx="8" stroke="currentColor" strokeWidth="1" strokeOpacity="0.35"/>
      <line x1="235" y1="195" x2="310" y2="195" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25"/>
      <line x1="330" y1="195" x2="365" y2="195" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2"/>
      <line x1="235" y1="215" x2="300" y2="215" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2"/>
      <line x1="235" y1="235" x2="295" y2="235" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2"/>
      <line x1="235" y1="260" x2="280" y2="260" stroke="currentColor" strokeWidth="2"   strokeOpacity="0.5"/>
      <line x1="325" y1="260" x2="365" y2="260" stroke="currentColor" strokeWidth="2"   strokeOpacity="0.7"/>
    </svg>
  )
}
