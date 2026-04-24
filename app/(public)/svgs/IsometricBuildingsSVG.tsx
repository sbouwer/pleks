export function IsometricBuildingsSVG() {
  return (
    <svg
      viewBox="0 0 400 340"
      fill="none"
      style={{
        position: "absolute", top: -140, left: "28%",
        width: "50%", height: "auto",
        pointerEvents: "none", zIndex: 0, opacity: 0.2,
        color: "var(--amber-ink)",
        maskImage: "linear-gradient(to bottom, black 55%, transparent 75%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 75%)",
      }}
      aria-hidden="true"
    >
      {/* Building 1 — tall, back left */}
      <g opacity="0.55">
        <path d="M100,100 L160,70 L220,100 L220,260 L160,290 L100,260 Z" stroke="currentColor" strokeWidth="1"/>
        <path d="M160,70 L160,290" stroke="currentColor" strokeWidth="0.5"/>
        <path d="M100,100 L160,130 L220,100" stroke="currentColor" strokeWidth="0.5"/>
        {[0,1,2,3,4,5].map(i => (
          <line key={i} x1="100" y1={130+i*22} x2="160" y2={160+i*22} stroke="currentColor" strokeWidth="0.3"/>
        ))}
      </g>
      {/* Building 2 — medium, mid right */}
      <g opacity="0.5">
        <path d="M180,150 L240,120 L300,150 L300,270 L240,300 L180,270 Z" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M240,120 L240,300" stroke="currentColor" strokeWidth="0.5"/>
        <path d="M180,150 L240,180 L300,150" stroke="currentColor" strokeWidth="0.5"/>
        {[0,1,2,3].map(i => (
          <line key={`f${i}`} x1="180" y1={180+i*24} x2="240" y2={210+i*24} stroke="currentColor" strokeWidth="0.4"/>
        ))}
        {[0,1,2,3].map(i => (
          <line key={`r${i}`} x1="240" y1={210+i*24} x2="300" y2={180+i*24} stroke="currentColor" strokeWidth="0.3"/>
        ))}
      </g>
      {/* Building 3 — short accent, front right */}
      <g opacity="0.9">
        <path d="M260,200 L310,175 L360,200 L360,280 L310,305 L260,280 Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M310,175 L310,305" stroke="currentColor" strokeWidth="0.7"/>
        <path d="M260,200 L310,225 L360,200" stroke="currentColor" strokeWidth="0.7"/>
        {[0,1,2].map(i => (
          <line key={i} x1="260" y1={225+i*20} x2="310" y2={250+i*20} stroke="currentColor" strokeWidth="0.5"/>
        ))}
      </g>
      {/* Small accent block — front left */}
      <g opacity="0.55">
        <path d="M70,220 L110,200 L150,220 L150,275 L110,295 L70,275 Z" stroke="currentColor" strokeWidth="0.8"/>
        <path d="M110,200 L110,295" stroke="currentColor" strokeWidth="0.4"/>
      </g>
    </svg>
  )
}
