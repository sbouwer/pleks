/**
 * app/(public)/svgs/FitScoreSVG.tsx — decorative FitScore-card line-art background for public pages
 *
 * Notes:  Presentational, aria-hidden. Absolutely positioned amber-ink watermark; no props.
 */
export function FitScoreSVG() {
  return (
    <svg
      viewBox="0 0 400 320"
      fill="none"
      style={{
        position: "absolute", top: -72, left: "28%",
        width: "50%", height: "auto",
        pointerEvents: "none", zIndex: 0, opacity: 0.2,
        color: "var(--amber-ink)",
        maskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
      }}
      aria-hidden="true"
    >
      {/* Card outline */}
      <rect x="20" y="40" width="280" height="240" rx="12" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1"/>
      {/* Header lines */}
      <line x1="40"  y1="65" x2="100" y2="65" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2"/>
      <line x1="180" y1="65" x2="220" y2="65" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2"/>
      <line x1="240" y1="65" x2="270" y2="65" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2"/>
      <line x1="40"  y1="75" x2="280" y2="75" stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.5"/>
      {/* Row 1 — credit record */}
      <circle cx="50" cy="100" r="10" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1"/>
      <line x1="68" y1="97"  x2="130" y2="97"  stroke="currentColor" strokeOpacity="0.5" strokeWidth="2"/>
      <line x1="68" y1="105" x2="110" y2="105" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/>
      <rect x="180" y="93"  width="90" height="6" rx="3" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5"/>
      <rect x="180" y="93"  width="77" height="6" rx="3" fill="currentColor" fillOpacity="0.45"/>
      {/* Row 2 — income */}
      <circle cx="50" cy="145" r="10" stroke="currentColor" strokeOpacity="0.65" strokeWidth="1"/>
      <line x1="68" y1="142" x2="140" y2="142" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2"/>
      <line x1="68" y1="150" x2="105" y2="150" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/>
      <rect x="180" y="138" width="90" height="6" rx="3" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5"/>
      <rect x="180" y="138" width="56" height="6" rx="3" fill="currentColor" fillOpacity="0.55"/>
      {/* Row 3 — tenancy */}
      <circle cx="50" cy="190" r="10" stroke="currentColor" strokeOpacity="0.8" strokeWidth="1"/>
      <line x1="68" y1="187" x2="125" y2="187" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2"/>
      <line x1="68" y1="195" x2="115" y2="195" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/>
      <rect x="180" y="183" width="90" height="6" rx="3" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5"/>
      <rect x="180" y="183" width="82" height="6" rx="3" fill="currentColor" fillOpacity="0.65"/>
      {/* Row 4 — ID */}
      <circle cx="50" cy="235" r="10" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1"/>
      <line x1="68" y1="232" x2="135" y2="232" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2"/>
      <rect x="180" y="228" width="90" height="6" rx="3" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5"/>
      <rect x="180" y="228" width="40" height="6" rx="3" fill="currentColor" fillOpacity="0.4"/>
      {/* Dial */}
      <circle cx="330" cy="90" r="55" stroke="currentColor" strokeOpacity="0.06" strokeWidth="4"/>
      <circle cx="330" cy="90" r="55" stroke="currentColor" strokeOpacity="0.65" strokeWidth="4"
        strokeDasharray="280 66" strokeLinecap="round" transform="rotate(-90 330 90)"/>
      <line x1="315" y1="85" x2="345" y2="85" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.5"/>
      <line x1="322" y1="95" x2="338" y2="95" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5"/>
      <rect x="305" y="160" width="50" height="20" rx="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.8"/>
      <line x1="315" y1="170" x2="345" y2="170" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5"/>
    </svg>
  )
}
