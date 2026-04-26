/**
 * Property Operations Network — abstract proptech illustration for /contact.
 *
 * Reads as: a few isometric-ish building outlines with floating UI fragments
 * (statement row, maintenance ticket, levy notice, key-on-peg) connected by
 * subtle network lines. Two amber notification dots at junctions.
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
          dashed at 0.6 stroke-width — barely there. */}
      <g stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 4" fill="none" opacity="0.55">
        {/* Apartment block → maintenance ticket */}
        <path d="M 165 165 Q 240 200 320 250" />
        {/* Apartment block → statement card */}
        <path d="M 130 220 Q 110 320 145 420" />
        {/* House → maintenance ticket */}
        <path d="M 425 195 Q 380 230 350 260" />
        {/* House → levy notice */}
        <path d="M 470 215 Q 510 320 475 440" />
        {/* Sectional title → levy notice */}
        <path d="M 320 470 Q 380 460 445 460" />
        {/* Statement card → sectional title */}
        <path d="M 175 460 Q 220 470 270 470" />
        {/* Maintenance ticket → key-on-peg */}
        <path d="M 380 290 Q 450 320 510 360" />
      </g>

      {/* ── Building 1 · Apartment block (top-left) ──────────────────────── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Front face */}
        <rect x="60" y="100" width="120" height="140" rx="2" />
        {/* Side face (depth perception, light isometric feel) */}
        <path d="M 180 100 L 200 85 L 200 225 L 180 240 Z" />
        <path d="M 60 100 L 80 85 L 200 85" />
        {/* Window grid — 3 columns, 4 rows */}
        <g strokeWidth="0.8">
          {[115, 140, 165, 190].map((y) => (
            <g key={y}>
              <rect x="74"  y={y} width="14" height="14" />
              <rect x="100" y={y} width="14" height="14" />
              <rect x="126" y={y} width="14" height="14" />
              <rect x="152" y={y} width="14" height="14" />
            </g>
          ))}
        </g>
        {/* Door */}
        <rect x="110" y="215" width="20" height="25" strokeWidth="1" />
        {/* Building label */}
        <text x="60" y="260" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-A · 12 UNITS
        </text>
      </g>

      {/* ── Building 2 · Freestanding house (top-right) ──────────────────── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Body */}
        <rect x="400" y="150" width="100" height="80" />
        {/* Roof */}
        <path d="M 395 150 L 450 110 L 505 150 Z" />
        {/* Side face */}
        <path d="M 500 150 L 520 130 L 520 215 L 500 230 Z" />
        <path d="M 505 150 L 525 130" />
        {/* Door + window */}
        <rect x="430" y="195" width="18" height="35" strokeWidth="1" />
        <rect x="465" y="170" width="22" height="22" strokeWidth="0.8" />
        <line x1="465" y1="181" x2="487" y2="181" strokeWidth="0.6" />
        <line x1="476" y1="170" x2="476" y2="192" strokeWidth="0.6" />
        {/* Building label */}
        <text x="400" y="248" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-B · 1 UNIT
        </text>
      </g>

      {/* ── Building 3 · Sectional title (bottom-centre) ──────────────────── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Body — narrower, taller building suggesting an apartment block in a scheme */}
        <rect x="270" y="430" width="50" height="130" rx="2" />
        {/* Side face */}
        <path d="M 320 430 L 335 415 L 335 550 L 320 565 Z" />
        <path d="M 270 430 L 285 415 L 335 415" />
        {/* Floor lines */}
        <g strokeWidth="0.5" opacity="0.6">
          <line x1="270" y1="455" x2="320" y2="455" />
          <line x1="270" y1="480" x2="320" y2="480" />
          <line x1="270" y1="505" x2="320" y2="505" />
          <line x1="270" y1="530" x2="320" y2="530" />
        </g>
        {/* Section indicator on one floor */}
        <rect x="278" y="485" width="12" height="14" strokeWidth="0.7" fill="currentColor" fillOpacity="0.06" />
        {/* Building label */}
        <text x="270" y="582" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-C · S 12
        </text>
      </g>

      {/* ── UI Card 1 · Maintenance ticket (centre-top) ──────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="305" y="245" width="105" height="55" rx="3" />
        {/* Inner dashed border — echoes the homepage moment-card style */}
        <rect x="310" y="250" width="95" height="45" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Header line */}
        <line x1="310" y1="262" x2="395" y2="262" strokeWidth="0.5" opacity="0.4" />
        {/* Tag bubble */}
        <rect x="312" y="254" width="22" height="6" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.08" stroke="none" />
        <text x="314" y="259" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          MAINT
        </text>
        {/* Body text lines */}
        <text x="310" y="275" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none">
          MX-8821 · GEYSER
        </text>
        <text x="310" y="284" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.7">
          ASSIGNED · 14·03
        </text>
        <text x="310" y="293" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.55">
          R 287.50 · pending
        </text>
      </g>

      {/* ── UI Card 2 · Statement excerpt (left-middle) ──────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="60" y="425" width="115" height="60" rx="3" />
        <rect x="65" y="430" width="105" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Header */}
        <text x="65" y="441" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" fontWeight="600" opacity="0.7">
          LANDLORD STATEMENT
        </text>
        <line x1="65" y1="445" x2="170" y2="445" strokeWidth="0.5" opacity="0.4" />
        {/* Statement rows — abstract */}
        <g fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">
          <text x="65" y="455">02 MAR · RENT</text>
          <text x="170" y="455" textAnchor="end" opacity="0.75">13,500.00</text>

          <text x="65" y="465">02 MAR · FEE</text>
          <text x="170" y="465" textAnchor="end" opacity="0.75">−1,350.00</text>

          <text x="65" y="475" opacity="0.85">PAYABLE</text>
          <text x="170" y="475" textAnchor="end" fontWeight="600">11,812.50</text>
        </g>
      </g>

      {/* ── UI Card 3 · Levy notice (right-bottom) ──────────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="445" y="430" width="100" height="55" rx="3" />
        <rect x="450" y="435" width="90" height="45" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        {/* Tag */}
        <rect x="452" y="439" width="20" height="6" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.08" stroke="none" />
        <text x="454" y="444" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          LEVY
        </text>
        {/* Content */}
        <text x="450" y="458" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none">
          BC LEVY · Q2
        </text>
        <text x="450" y="467" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.7">
          DUE · 30·04·26
        </text>
        <text x="450" y="476" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none" opacity="0.55">
          R 3,400.00
        </text>
      </g>

      {/* ── Key-on-peg motif (top-far-right) ─────────────────────────────── */}
      {/* Echoes the founder section's pegboard. Lower opacity to read as decorative anchor. */}
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7">
        {/* Peg */}
        <circle cx="540" cy="80" r="2" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Hanging line */}
        <line x1="540" y1="82" x2="540" y2="92" strokeWidth="0.5" />
        {/* Key bow */}
        <circle cx="540" cy="98" r="5" />
        <circle cx="540" cy="98" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Key shaft */}
        <line x1="540" y1="103" x2="540" y2="118" />
        {/* Key teeth */}
        <line x1="540" y1="111" x2="544" y2="111" />
        <line x1="540" y1="116" x2="543" y2="116" />
        {/* Key tag */}
        <rect x="525" y="125" width="30" height="15" rx="1.5" strokeWidth="0.7" />
        <text x="540" y="135" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">
          KEY · 0417
        </text>
      </g>

      {/* ── Notification dots (warm amber accents at network junctions) ─── */}
      {/* These are the only points of warmth in the composition — small but
          distinctive. They visually echo the active dot in the homepage
          Trust-reconciled badge and the notice-strip dot. */}
      <g>
        {/* Junction near maintenance ticket */}
        <circle cx="320" cy="250" r="3" fill="var(--amber)" opacity="0.85" />
        <circle cx="320" cy="250" r="6" fill="var(--amber)" opacity="0.18" />
        {/* Junction near sectional title */}
        <circle cx="270" cy="470" r="3" fill="var(--amber)" opacity="0.85" />
        <circle cx="270" cy="470" r="6" fill="var(--amber)" opacity="0.18" />
      </g>
    </svg>
  )
}
