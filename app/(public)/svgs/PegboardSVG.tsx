export function PegboardSVG() {
  const pegCols = [70, 105, 140, 175, 210, 245, 280, 315, 350]

  return (
    <svg
      viewBox="0 0 400 280"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: "180%", height: "180%",
        pointerEvents: "none", zIndex: 0, opacity: 0.05,
        color: "var(--amber-ink)",
      }}
      aria-hidden="true"
    >
      <rect x="30" y="30" width="340" height="210" rx="6" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2"/>
      <rect x="38" y="38" width="324" height="194" rx="4" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6"/>
      <text x="44" y="52" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" fillOpacity="0.8">PORTFOLIO KEYS · ROX &amp; CO · 2024</text>
      <text x="356" y="52" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" fillOpacity="0.6">KEY BOARD — 01 OF 02</text>
      {/* Peg holes — two rows */}
      <g fill="currentColor" fillOpacity="0.35">
        {pegCols.map(cx => (
          <g key={cx}>
            <circle cx={cx} cy="72"  r="2"/>
            <circle cx={cx} cy="145" r="2"/>
          </g>
        ))}
      </g>
      {/* Key A-01 · 17 Loop */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="105" y1="72" x2="105" y2="84" strokeWidth="0.6"/>
        <circle cx="105" cy="90" r="5"/>
        <circle cx="105" cy="90" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="105" y1="95" x2="105" y2="112"/>
        <line x1="105" y1="103" x2="109" y2="103"/>
        <line x1="105" y1="108" x2="108" y2="108"/>
        <rect x="85" y="120" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="105" y="131" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" stroke="none">A-01</text>
        <text x="105" y="138" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">17 LOOP</text>
      </g>
      {/* Key B-03 · Bo-Kaap */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="175" y1="72" x2="175" y2="84" strokeWidth="0.6"/>
        <circle cx="175" cy="90" r="5"/>
        <circle cx="175" cy="90" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="175" y1="95" x2="175" y2="114"/>
        <line x1="175" y1="105" x2="179" y2="105"/>
        <line x1="175" y1="110" x2="178" y2="110"/>
        <rect x="155" y="122" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="175" y="133" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" stroke="none">B-03</text>
        <text x="175" y="140" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">BO-KAAP</text>
      </g>
      {/* Key C-05 · Sandton (highlighted) */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="280" y1="72" x2="280" y2="84" strokeWidth="0.6"/>
        <circle cx="280" cy="90" r="5"/>
        <circle cx="280" cy="90" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="280" y1="95" x2="280" y2="110"/>
        <line x1="280" y1="101" x2="284" y2="101"/>
        <line x1="280" y1="106" x2="283" y2="106"/>
        <rect x="260" y="118" width="40" height="20" rx="2" strokeWidth="0.8" fill="currentColor" fillOpacity="0.12"/>
        <text x="280" y="129" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" stroke="none">C-05</text>
        <text x="280" y="136" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">SANDTON</text>
      </g>
      {/* Footer legend */}
      <line x1="30" y1="235" x2="370" y2="235" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3"/>
      <text x="44" y="250" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" fillOpacity="0.7">6 ACTIVE · 1 OUT · 18 PEG SLOTS</text>
      <text x="356" y="250" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" fillOpacity="0.7">LAST COUNT · 14·03·24</text>
    </svg>
  )
}
