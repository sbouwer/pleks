/**
 * Property Operations Network — abstract proptech illustration for /contact.
 *
 * Reads as: a few isometric-ish building outlines with floating UI fragments
 * (statement row, maintenance ticket, levy notice, key-on-peg) connected by
 * subtle network lines. Two amber notification dots at junctions.
 *
 * Composition is biased to the LEFT 60% of the canvas because the right 40%
 * sits behind the contact form. The right side carries decorative fragments
 * (network endpoints, faint outlines) but no primary anchors.
 *
 * Vocabulary deliberately echoes the rest of the site:
 *   - statement row → mirrors the homepage landlord-statement artefact
 *   - maintenance ticket → mirrors upcoming maintenance UI
 *   - key-on-peg → echoes the founder section's pegboard background
 *
 * Renders at low opacity behind the contact form. Not interactive.
 */

export function PropertyOperationsNetworkSVG() {
  return (
    <svg
      viewBox="0 0 600 700"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.07,
        color: "var(--ink-soft)",
      }}
      aria-hidden="true"
    >
      {/* ── Network connecting lines ─────────────────────────────────────── */}
      {/* Drawn first so they sit behind everything else. Curved Bezier paths,
          dashed at 0.6 stroke-width — barely there. All endpoints stay within
          the visible left 60% of the canvas (x < 380) where possible. */}
      <g stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 4" fill="none" opacity="0.55">
        {/* Apartment block → maintenance ticket */}
        <path d="M 165 195 Q 220 230 270 280" />
        {/* Apartment block → statement card */}
        <path d="M 130 250 Q 100 350 145 440" />
        {/* House → maintenance ticket */}
        <path d="M 290 215 Q 285 250 285 270" />
        {/* House → key-on-peg (right side, decorative) */}
        <path d="M 340 195 Q 420 200 480 195" />
        {/* Statement card → sectional title */}
        <path d="M 220 480 Q 250 480 280 490" />
        {/* Maintenance ticket → sectional title */}
        <path d="M 270 340 Q 280 410 295 470" />
        {/* Sectional title → levy notice (right, partly behind form) */}
        <path d="M 340 510 Q 410 510 470 510" />
      </g>

      {/* ── Building 1 · Apartment block (top-left, FULL roof breathing room) */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Front face — moved down so roof doesn't crop */}
        <rect x="60" y="130" width="120" height="140" rx="2" />
        {/* Side face (depth perception, light isometric feel) */}
        <path d="M 180 130 L 200 115 L 200 255 L 180 270 Z" />
        <path d="M 60 130 L 80 115 L 200 115" />
        {/* Window grid — 3 columns, 4 rows */}
        <g strokeWidth="0.8">
          {[145, 170, 195, 220].map((y) => (
            <g key={y}>
              <rect x="74"  y={y} width="14" height="14" />
              <rect x="100" y={y} width="14" height="14" />
              <rect x="126" y={y} width="14" height="14" />
              <rect x="152" y={y} width="14" height="14" />
            </g>
          ))}
        </g>
        {/* Door */}
        <rect x="110" y="245" width="20" height="25" strokeWidth="1" />
        {/* Building label */}
        <text x="60" y="290" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-A · 12 UNITS
        </text>
      </g>

      {/* ── Building 2 · Freestanding house (centre-top, ROOF VISIBLE) ──── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Roof — drawn FIRST so we can see it sit cleanly above the body */}
        <path d="M 235 175 L 290 130 L 345 175" strokeLinejoin="round" />
        {/* Side roof face for depth */}
        <path d="M 345 175 L 360 165 L 305 120 L 290 130 Z" opacity="0.7" />
        {/* Body */}
        <rect x="240" y="175" width="100" height="80" />
        {/* Side face */}
        <path d="M 340 175 L 360 165 L 360 240 L 340 255 Z" />
        {/* Door + window */}
        <rect x="270" y="220" width="18" height="35" strokeWidth="1" />
        <rect x="305" y="195" width="22" height="22" strokeWidth="0.8" />
        <line x1="305" y1="206" x2="327" y2="206" strokeWidth="0.6" />
        <line x1="316" y1="195" x2="316" y2="217" strokeWidth="0.6" />
        {/* Building label */}
        <text x="240" y="273" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-B · 1 UNIT
        </text>
      </g>

      {/* ── Building 3 · Sectional title (bottom-centre, in left 60%) ──── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Body — narrower, taller building suggesting an apartment in a scheme */}
        <rect x="280" y="470" width="50" height="130" rx="2" />
        {/* Side face */}
        <path d="M 330 470 L 345 455 L 345 590 L 330 605 Z" />
        <path d="M 280 470 L 295 455 L 345 455" />
        {/* Floor lines */}
        <g strokeWidth="0.5" opacity="0.6">
          <line x1="280" y1="495" x2="330" y2="495" />
          <line x1="280" y1="520" x2="330" y2="520" />
          <line x1="280" y1="545" x2="330" y2="545" />
          <line x1="280" y1="570" x2="330" y2="570" />
        </g>
        {/* Section indicator on one floor */}
        <rect x="288" y="525" width="12" height="14" strokeWidth="0.7" fill="currentColor" fillOpacity="0.06" />
        {/* Building label */}
        <text x="280" y="622" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-C · S 12
        </text>
      </g>

      {/* ── UI Card 1 · Maintenance ticket (between buildings, LEFT 60%) ── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="170" y="295" width="120" height="55" rx="3" />
        {/* Inner dashed border — echoes the homepage moment-card style */}
        <rect x="175" y="300" width="110" height="45" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Header line */}
        <line x1="175" y1="312" x2="280" y2="312" strokeWidth="0.5" opacity="0.4" />
        {/* Tag bubble */}
        <rect x="178" y="304" width="24" height="6.5" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.08" stroke="none" />
        <text x="180" y="309" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          MAINT
        </text>
        {/* Body text lines */}
        <text x="175" y="325" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none">
          MX-8821 · GEYSER
        </text>
        <text x="175" y="334" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.7">
          ASSIGNED · 14·03
        </text>
        <text x="175" y="343" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.55">
          R 287.50 · pending
        </text>
      </g>

      {/* ── UI Card 2 · Statement excerpt (left-middle, LEFT 60%) ──────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="60" y="445" width="135" height="65" rx="3" />
        <rect x="65" y="450" width="125" height="55" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Header */}
        <text x="65" y="461" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" fontWeight="600" opacity="0.7">
          LANDLORD STATEMENT
        </text>
        <line x1="65" y1="465" x2="190" y2="465" strokeWidth="0.5" opacity="0.4" />
        {/* Statement rows — abstract */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="65" y="476">02 MAR · RENT</text>
          <text x="190" y="476" textAnchor="end" opacity="0.75">13,500.00</text>

          <text x="65" y="486">02 MAR · FEE</text>
          <text x="190" y="486" textAnchor="end" opacity="0.75">−1,350.00</text>

          <text x="65" y="498" opacity="0.85" fontWeight="600">PAYABLE</text>
          <text x="190" y="498" textAnchor="end" fontWeight="600">11,812.50</text>
        </g>
      </g>

      {/* ── UI Card 3 · Levy notice (right side, decorative, partly hidden) */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="445" y="485" width="100" height="55" rx="3" />
        <rect x="450" y="490" width="90" height="45" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Tag */}
        <rect x="452" y="494" width="20" height="6" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.08" stroke="none" />
        <text x="454" y="499" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          LEVY
        </text>
        {/* Content */}
        <text x="450" y="513" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none">
          BC LEVY · Q2
        </text>
        <text x="450" y="522" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.7">
          DUE · 30·04·26
        </text>
        <text x="450" y="531" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.55">
          R 3,400.00
        </text>
      </g>

      {/* ── Key-on-peg motif (top-right, decorative anchor) ───────────────── */}
      {/* Echoes the founder section's pegboard. Visible above the form. */}
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7">
        {/* Peg */}
        <circle cx="500" cy="135" r="2" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Hanging line */}
        <line x1="500" y1="137" x2="500" y2="147" strokeWidth="0.5" />
        {/* Key bow */}
        <circle cx="500" cy="153" r="5" />
        <circle cx="500" cy="153" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Key shaft */}
        <line x1="500" y1="158" x2="500" y2="173" />
        {/* Key teeth */}
        <line x1="500" y1="166" x2="504" y2="166" />
        <line x1="500" y1="171" x2="503" y2="171" />
        {/* Key tag */}
        <rect x="485" y="180" width="30" height="15" rx="1.5" strokeWidth="0.7" />
        <text x="500" y="190" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">
          KEY · 0417
        </text>
      </g>

      {/* ── Notification dots (warm amber accents at network junctions) ─── */}
      {/* Both placed in the visible left 60% so they're not hidden by form. */}
      <g>
        {/* Junction near maintenance ticket */}
        <circle cx="270" cy="290" r="3" fill="var(--amber)" opacity="0.85" />
        <circle cx="270" cy="290" r="6" fill="var(--amber)" opacity="0.18" />
        {/* Junction near sectional title */}
        <circle cx="280" cy="490" r="3" fill="var(--amber)" opacity="0.85" />
        <circle cx="280" cy="490" r="6" fill="var(--amber)" opacity="0.18" />
      </g>
    </svg>
  )
}
