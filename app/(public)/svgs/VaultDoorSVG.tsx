/**
 * app/(public)/svgs/VaultDoorSVG.tsx — decorative vault-door line-art background for public pages
 *
 * Notes:  Presentational, aria-hidden. Absolutely positioned amber-ink watermark; no props.
 */
export function VaultDoorSVG() {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      style={{
        position: "absolute", top: -72, left: "28%",
        width: "50%", height: "auto",
        pointerEvents: "none", zIndex: 0, opacity: 0.1,
        color: "var(--amber-ink)",
        maskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 65%)",
      }}
      aria-hidden="true"
    >
      <rect x="30" y="30" width="340" height="340" rx="3" strokeWidth="1.5"/>
      <rect x="48" y="48" width="304" height="304" rx="2" opacity="0.45"/>
      <g fill="currentColor">
        <circle cx="44" cy="44" r="2.2"/>
        <circle cx="356" cy="44" r="2.2"/>
        <circle cx="44" cy="356" r="2.2"/>
        <circle cx="356" cy="356" r="2.2"/>
      </g>
      <g fill="currentColor" fillOpacity="0.55">
        <circle cx="120" cy="70" r="1.5"/><circle cx="200" cy="68" r="1.5"/><circle cx="280" cy="70" r="1.5"/>
        <circle cx="120" cy="330" r="1.5"/><circle cx="200" cy="332" r="1.5"/><circle cx="280" cy="330" r="1.5"/>
        <circle cx="70" cy="120" r="1.5"/><circle cx="70" cy="280" r="1.5"/>
        <circle cx="330" cy="120" r="1.5"/><circle cx="330" cy="200" r="1.5"/><circle cx="330" cy="280" r="1.5"/>
      </g>
      <rect x="158" y="74" width="84" height="24" rx="1" strokeWidth="0.8" fill="currentColor" fillOpacity="0.04"/>
      <text x="200" y="86" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none" letterSpacing="0.08em">PLEKS &amp; CO</text>
      <text x="200" y="93" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="4.8" fill="currentColor" opacity="0.72" stroke="none">EST. MMXXVI · CAPE TOWN</text>
      <circle cx="200" cy="215" r="118" strokeWidth="1.5"/>
      <circle cx="200" cy="215" r="110" opacity="0.55"/>
      <circle cx="200" cy="215" r="98" strokeDasharray="2 3" opacity="0.4"/>
      <g strokeWidth="1.4" strokeLinecap="round">
        <line x1="200" y1="97" x2="200" y2="84"/>
        <line x1="284" y1="132" x2="293" y2="123"/>
        <line x1="318" y1="215" x2="331" y2="215"/>
        <line x1="284" y1="298" x2="293" y2="307"/>
        <line x1="200" y1="333" x2="200" y2="346"/>
        <line x1="116" y1="298" x2="107" y2="307"/>
        <line x1="82" y1="215" x2="69" y2="215"/>
        <line x1="116" y1="132" x2="107" y2="123"/>
      </g>
      <g strokeWidth="0.9">
        <rect x="62" y="178" width="16" height="74" rx="1" fill="currentColor" fillOpacity="0.05"/>
        <line x1="70" y1="178" x2="70" y2="252" strokeWidth="0.4" opacity="0.4"/>
        <circle cx="70" cy="188" r="1.4" fill="currentColor"/>
        <circle cx="70" cy="204" r="1.4" fill="currentColor"/>
        <circle cx="70" cy="220" r="1.4" fill="currentColor"/>
        <circle cx="70" cy="236" r="1.4" fill="currentColor"/>
      </g>
      <g transform="translate(200, 182)">
        <circle r="24" strokeWidth="1"/>
        <circle r="18" opacity="0.5"/>
        <circle r="3.5" fill="currentColor"/>
        <line x1="0" y1="-24" x2="0" y2="-31" strokeWidth="1.4"/>
        <g strokeWidth="0.5" opacity="0.7">
          <line x1="0" y1="-21" x2="0" y2="-19"/>
          <line x1="14.8" y1="-14.8" x2="13.4" y2="-13.4"/>
          <line x1="21" y1="0" x2="19" y2="0"/>
          <line x1="14.8" y1="14.8" x2="13.4" y2="13.4"/>
          <line x1="0" y1="21" x2="0" y2="19"/>
          <line x1="-14.8" y1="14.8" x2="-13.4" y2="13.4"/>
          <line x1="-21" y1="0" x2="-19" y2="0"/>
          <line x1="-14.8" y1="-14.8" x2="-13.4" y2="-13.4"/>
        </g>
        <text x="0" y="-13" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="4" fill="currentColor" opacity="0.7" stroke="none">0</text>
        <text x="14" y="2" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="4" fill="currentColor" opacity="0.7" stroke="none">25</text>
        <text x="0" y="17" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="4" fill="currentColor" opacity="0.7" stroke="none">50</text>
        <text x="-14" y="2" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="4" fill="currentColor" opacity="0.7" stroke="none">75</text>
      </g>
      <g transform="translate(200, 258)">
        <circle r="34" strokeWidth="2"/>
        <circle r="26" opacity="0.45"/>
        <circle r="7" fill="currentColor" fillOpacity="0.35"/>
        <g strokeWidth="2" strokeLinecap="round">
          <line x1="0" y1="-34" x2="0" y2="-7"/>
          <line x1="0" y1="34" x2="0" y2="7"/>
          <line x1="-34" y1="0" x2="-7" y2="0"/>
          <line x1="34" y1="0" x2="7" y2="0"/>
        </g>
        <g fill="currentColor">
          <circle cx="0" cy="-34" r="2.8"/>
          <circle cx="0" cy="34" r="2.8"/>
          <circle cx="-34" cy="0" r="2.8"/>
          <circle cx="34" cy="0" r="2.8"/>
        </g>
      </g>
      <rect x="168" y="338" width="64" height="14" rx="1" strokeWidth="0.6"/>
      <text x="200" y="348" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" opacity="0.8" stroke="none">N&#x00BA; 0417 · RECON&apos;D</text>
    </svg>
  )
}
