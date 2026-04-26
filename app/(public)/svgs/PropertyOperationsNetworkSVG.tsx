/**
 * Property Operations Network — abstract proptech illustration for /contact.
 *
 * Reads as: building outlines + UI callout cards scattered organically across
 * the canvas, connected by traced amber-tinted lines (same grammar as the
 * founder timeline's road).
 *
 * Layout principles:
 *   - APARTMENT BLOCK anchors bottom-left as the dominant visual element
 *   - Cards distributed across top, middle, bottom — no neat grid
 *   - Top-right used heavily (visible empty space when form sits below)
 *   - AVOID middle-right and bottom-right — form sits there
 *
 * Vocabulary deliberately echoes the rest of the site:
 *   - statement card → mirrors the homepage landlord-statement artefact
 *   - maintenance card → mirrors upcoming maintenance UI
 *   - in-going card → echoes the inspection/intake workflow
 *   - lease renewal card → echoes BUILD_12 lease lifecycle
 *   - deposit card → echoes BUILD_17 deposit recon
 *   - key-on-peg → echoes the founder section's pegboard background
 *   - traced amber lines → echo the founder timeline's road connections
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
        opacity: 0.08,
        color: "var(--ink-soft)",
      }}
      aria-hidden="true"
    >
      {/* ── Traced connection lines ───────────────────────────────────────── */}
      {/* Drawn first so they sit behind everything else.
          Two layers per line: a faint base stroke + an amber dashed overlay,
          same grammar as the founder timeline's road. */}

      {/* LEASE RENEWAL → LANDLORD STATEMENT (top horizontal) */}
      <g fill="none">
        <path d="M 165 75 L 245 75" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        <path d="M 165 75 L 245 75" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* LANDLORD STATEMENT → INCOMING (top-right) */}
      <g fill="none">
        <path d="M 405 75 L 470 75" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        <path d="M 405 75 L 470 75" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* LEASE RENEWAL → MAINTENANCE (left vertical) */}
      <g fill="none">
        <path d="M 100 110 L 100 200 L 130 200" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path d="M 100 110 L 100 200 L 130 200" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* MAINTENANCE → DEPOSIT card (centre) */}
      <g fill="none">
        <path d="M 250 230 L 290 230 L 290 280 L 320 280" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path d="M 250 230 L 290 230 L 290 280 L 320 280" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* DEPOSIT → Sectional title block (centre-down) */}
      <g fill="none">
        <path d="M 380 320 L 380 360 L 350 360 L 350 410" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path d="M 380 320 L 380 360 L 350 360 L 350 410" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* Sectional title → IN-GOING (bottom-centre) */}
      <g fill="none">
        <path d="M 350 530 L 350 595 L 290 595" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path d="M 350 530 L 350 595 L 290 595" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* APARTMENT BLOCK → IN-GOING (bottom horizontal) */}
      <g fill="none">
        <path d="M 175 580 L 215 580" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        <path d="M 175 580 L 215 580" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* APARTMENT BLOCK → MAINTENANCE (left, going up) */}
      <g fill="none">
        <path d="M 100 470 L 100 280" stroke="var(--rule-strong)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        <path d="M 100 470 L 100 280" stroke="var(--amber-ink)" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 6" opacity="0.6" />
      </g>

      {/* ── Callout 1 · LEASE RENEWAL (top-left) ─────────────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="40" y="45" width="125" height="60" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="45" y="50" width="115" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="48" y="62" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          LEASE RENEWAL
        </text>
        <line x1="48" y1="66" x2="160" y2="66" strokeWidth="0.5" opacity="0.4" />
        {/* Tag */}
        <rect x="48" y="71" width="38" height="7" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.1" stroke="none" />
        <text x="50" y="77" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          14 DAYS
        </text>
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="92" y="77">L-2403 · CPA s14</text>
          <text x="48" y="89" opacity="0.7">N. DLAMINI · UNIT A</text>
          <text x="48" y="98" opacity="0.55">SENT · 14·03 · NOTICED</text>
        </g>
        {/* Connection pin */}
        <circle cx="165" cy="75" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Callout 2 · LANDLORD STATEMENT (top-centre) ──────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="245" y="45" width="160" height="60" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="250" y="50" width="150" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="253" y="62" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          LANDLORD STATEMENT
        </text>
        <line x1="253" y1="66" x2="400" y2="66" strokeWidth="0.5" opacity="0.4" />
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="253" y="77">02 MAR · RENT</text>
          <text x="400" y="77" textAnchor="end" opacity="0.75">13,500.00</text>
          <text x="253" y="87">02 MAR · FEE</text>
          <text x="400" y="87" textAnchor="end" opacity="0.75">−1,350.00</text>
          <text x="253" y="98" opacity="0.85" fontWeight="600">PAYABLE</text>
          <text x="400" y="98" textAnchor="end" fontWeight="600">11,812.50</text>
        </g>
        {/* Connection pins */}
        <circle cx="245" cy="75" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <circle cx="405" cy="75" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Callout 3 · INCOMING notification (top-right) ────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="470" y="45" width="115" height="60" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="475" y="50" width="105" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="478" y="62" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          INCOMING
        </text>
        <line x1="478" y1="66" x2="580" y2="66" strokeWidth="0.5" opacity="0.4" />
        {/* New-message indicator */}
        <circle cx="572" cy="62" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="478" y="77" fontWeight="600">M. NDLOVU</text>
          <text x="478" y="87" opacity="0.75">RE: GEYSER · QUOTE</text>
          <text x="478" y="98" opacity="0.55">14·03 · 09:42</text>
        </g>
        {/* Connection pin */}
        <circle cx="470" cy="75" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Callout 4 · MAINTENANCE (mid-left) ───────────────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="130" y="200" width="120" height="60" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="135" y="205" width="110" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="138" y="217" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          MAINTENANCE
        </text>
        <line x1="138" y1="221" x2="245" y2="221" strokeWidth="0.5" opacity="0.4" />
        <rect x="138" y="226" width="32" height="7" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.1" stroke="none" />
        <text x="140" y="232" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="currentColor" stroke="none" fontWeight="600">
          GEYSER
        </text>
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="174" y="232" opacity="0.75">MX-8821</text>
          <text x="138" y="244" opacity="0.7">ASSIGNED · M. NDLOVU</text>
          <text x="138" y="253" opacity="0.55">QUOTED · R 287.50</text>
        </g>
        {/* Connection pins */}
        <circle cx="130" cy="200" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <circle cx="250" cy="230" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Callout 5 · DEPOSIT (centre-mid) ─────────────────────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="320" y="250" width="125" height="65" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="325" y="255" width="115" height="55" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="328" y="267" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          DEPOSIT · TRUST
        </text>
        <line x1="328" y1="271" x2="440" y2="271" strokeWidth="0.5" opacity="0.4" />
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="328" y="282">HELD</text>
          <text x="440" y="282" textAnchor="end" fontWeight="600">R 12,000.00</text>
          <text x="328" y="293" opacity="0.7">INTEREST · YTD</text>
          <text x="440" y="293" textAnchor="end" opacity="0.75">R 287.40</text>
          <text x="328" y="304" opacity="0.55">TRUST · ABSA 407 889</text>
        </g>
        {/* Connection pins */}
        <circle cx="320" cy="280" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <circle cx="380" cy="320" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Building 1 · Sectional title block (centre, traced from DEPOSIT) */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Body */}
        <rect x="320" y="410" width="60" height="120" rx="2" />
        {/* Side face for isometric depth */}
        <path d="M 380 410 L 395 395 L 395 515 L 380 530 Z" />
        <path d="M 320 410 L 335 395 L 395 395" />
        {/* Floor lines */}
        <g strokeWidth="0.5" opacity="0.6">
          <line x1="320" y1="435" x2="380" y2="435" />
          <line x1="320" y1="460" x2="380" y2="460" />
          <line x1="320" y1="485" x2="380" y2="485" />
          <line x1="320" y1="510" x2="380" y2="510" />
        </g>
        {/* Section indicator on one floor */}
        <rect x="328" y="465" width="14" height="14" strokeWidth="0.7" fill="currentColor" fillOpacity="0.06" />
        {/* Building label */}
        <text x="320" y="548" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-C · S 12
        </text>
        {/* Connection pin */}
        <circle cx="350" cy="410" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Building 2 · APARTMENT BLOCK (bottom-left, the visual anchor) ── */}
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        {/* Front face */}
        <rect x="50" y="470" width="125" height="155" rx="2" />
        {/* Side face for isometric depth */}
        <path d="M 175 470 L 195 455 L 195 610 L 175 625 Z" />
        <path d="M 50 470 L 70 455 L 195 455" />
        {/* Window grid — 4 columns, 5 rows */}
        <g strokeWidth="0.8">
          {[485, 510, 535, 560, 585].map((y) => (
            <g key={y}>
              <rect x="64"  y={y} width="14" height="14" />
              <rect x="89"  y={y} width="14" height="14" />
              <rect x="114" y={y} width="14" height="14" />
              <rect x="140" y={y} width="14" height="14" />
            </g>
          ))}
        </g>
        {/* Door */}
        <rect x="104" y="605" width="16" height="20" strokeWidth="1" />
        {/* Building label */}
        <text x="50" y="645" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none" opacity="0.7">
          PROP-A · 12 UNITS
        </text>
        {/* Connection pins */}
        <circle cx="100" cy="470" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <circle cx="175" cy="580" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Callout 6 · IN-GOING inspection (bottom-centre) ──────────────── */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <rect x="215" y="565" width="120" height="60" rx="3" fill="var(--paper)" fillOpacity="0.04" />
        <rect x="220" y="570" width="110" height="50" rx="2" strokeWidth="0.5" strokeDasharray="1.5 2" opacity="0.55" />
        <text x="223" y="582" fontFamily="JetBrains Mono, monospace" fontSize="6" fill="currentColor" stroke="none" fontWeight="600" opacity="0.8" letterSpacing="0.5">
          IN-GOING
        </text>
        <line x1="223" y1="586" x2="330" y2="586" strokeWidth="0.5" opacity="0.4" />
        <g fontFamily="JetBrains Mono, monospace" fontSize="5.5" fill="currentColor" stroke="none">
          <text x="223" y="597" fontWeight="600">N. DLAMINI</text>
          <text x="223" y="607" opacity="0.75">28 MAR · 14:00</text>
          <text x="223" y="618" opacity="0.55">PHOTOS · 0/12 · GPS</text>
        </g>
        {/* Connection pins */}
        <circle cx="215" cy="580" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
        <circle cx="290" cy="595" r="2.5" fill="var(--amber)" stroke="none" opacity="0.9" />
      </g>

      {/* ── Key-on-peg motif (top-right corner, decorative anchor) ───────── */}
      {/* Echoes the founder section's pegboard. Sits in top-right empty space. */}
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.7">
        {/* Peg */}
        <circle cx="555" cy="135" r="2" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Hanging line */}
        <line x1="555" y1="137" x2="555" y2="147" strokeWidth="0.5" />
        {/* Key bow */}
        <circle cx="555" cy="153" r="5" />
        <circle cx="555" cy="153" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
        {/* Key shaft */}
        <line x1="555" y1="158" x2="555" y2="173" />
        {/* Key teeth */}
        <line x1="555" y1="166" x2="559" y2="166" />
        <line x1="555" y1="171" x2="558" y2="171" />
        {/* Key tag */}
        <rect x="540" y="180" width="30" height="15" rx="1.5" strokeWidth="0.7" />
        <text x="555" y="190" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">
          KEY · 0417
        </text>
      </g>

      {/* ── Notification glow halos (around key connection pins) ─────────── */}
      <g>
        <circle cx="165" cy="75" r="6" fill="var(--amber)" opacity="0.18" />
        <circle cx="572" cy="62" r="5" fill="var(--amber)" opacity="0.22" />
        <circle cx="100" cy="470" r="6" fill="var(--amber)" opacity="0.18" />
      </g>
    </svg>
  )
}
