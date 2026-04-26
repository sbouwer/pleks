export function PegboardSVG() {
  return (
    <svg
      viewBox="0 0 1100 1820"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 0, opacity: 0.15,
        color: "var(--amber-ink)",
      }}
      aria-hidden="true"
    >

      {/* Header bar */}
      <text x="64" y="74" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill="currentColor" fillOpacity="0.8">{`PORTFOLIO KEYS · ROX & CO · ${new Date().getFullYear()}`}</text>
      <text x="1036" y="74" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill="currentColor" fillOpacity="0.6">KEY BOARD — 02 OF 03</text>
      <line x1="64" y1="86" x2="1036" y2="86"
        stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3"/>

      {/* Peg-hole grid: 9 columns × 12 rows = 108 slots, full width */}
      {(() => {
        const cols = [120, 220, 320, 420, 520, 620, 720, 820, 920, 1020]
        const rows = [130, 270, 410, 550, 690, 830, 970, 1110, 1250, 1390, 1530, 1670]
        return (
          <g fill="currentColor" fillOpacity="0.32">
            {rows.map(cy =>
              cols.map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2"/>)
            )}
          </g>
        )
      })()}

      {/* Subtle horizontal rules between row pairs — board panelling */}
      <g stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.5" strokeDasharray="1 5">
        <line x1="60" y1="340" x2="1040" y2="340"/>
        <line x1="60" y1="620" x2="1040" y2="620"/>
        <line x1="60" y1="900" x2="1040" y2="900"/>
        <line x1="60" y1="1180" x2="1040" y2="1180"/>
        <line x1="60" y1="1460" x2="1040" y2="1460"/>
      </g>

      {/* ─── KEYS ─── distributed across the board, drawn with consistent grammar */}

      {/* A-01 · 17 LOOP — top left, hanging from row 1 */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="220" y1="130" x2="220" y2="142" strokeWidth="0.6"/>
        <circle cx="220" cy="148" r="5"/>
        <circle cx="220" cy="148" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="220" y1="153" x2="220" y2="170"/>
        <line x1="220" y1="161" x2="224" y2="161"/>
        <line x1="220" y1="166" x2="223" y2="166"/>
        <rect x="200" y="178" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="220" y="189" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">A-01</text>
        <text x="220" y="196" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">17 LOOP</text>
      </g>

      {/* B-03 · BO-KAAP — top right */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="820" y1="130" x2="820" y2="142" strokeWidth="0.6"/>
        <circle cx="820" cy="148" r="5"/>
        <circle cx="820" cy="148" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="820" y1="153" x2="820" y2="170"/>
        <line x1="820" y1="161" x2="824" y2="161"/>
        <line x1="820" y1="166" x2="823" y2="166"/>
        <rect x="800" y="178" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="820" y="189" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">B-03</text>
        <text x="820" y="196" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">BO-KAAP</text>
      </g>

      {/* C-05 · PHILIPPI — second band, mid-left */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="320" y1="410" x2="320" y2="422" strokeWidth="0.6"/>
        <circle cx="320" cy="428" r="5"/>
        <circle cx="320" cy="428" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="320" y1="433" x2="320" y2="450"/>
        <line x1="320" y1="441" x2="324" y2="441"/>
        <line x1="320" y1="446" x2="323" y2="446"/>
        <rect x="300" y="458" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="320" y="469" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">C-05</text>
        <text x="320" y="476" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">PHILIPPI</text>
      </g>

      {/* D-08 · CONTAINER WK — second band, far right */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="920" y1="410" x2="920" y2="422" strokeWidth="0.6"/>
        <circle cx="920" cy="428" r="5"/>
        <circle cx="920" cy="428" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="920" y1="433" x2="920" y2="450"/>
        <line x1="920" y1="441" x2="924" y2="441"/>
        <line x1="920" y1="446" x2="923" y2="446"/>
        <rect x="900" y="458" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="920" y="469" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">D-08</text>
        <text x="920" y="476" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">CONTAINER WK</text>
      </g>

      {/* E-02 · CLAREMONT — third band, mid */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="120" y1="690" x2="120" y2="702" strokeWidth="0.6"/>
        <circle cx="120" cy="708" r="5"/>
        <circle cx="120" cy="708" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="120" y1="713" x2="120" y2="730"/>
        <line x1="120" y1="721" x2="124" y2="721"/>
        <line x1="120" y1="726" x2="123" y2="726"/>
        <rect x="100" y="738" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="120" y="749" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">E-02</text>
        <text x="120" y="756" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">CLAREMONT</text>
      </g>

      {/* F-12 · SANDTON — third band, right (HIGHLIGHTED — out for inspection) */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="720" y1="690" x2="720" y2="702" strokeWidth="0.6"/>
        <circle cx="720" cy="708" r="5"/>
        <circle cx="720" cy="708" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="720" y1="713" x2="720" y2="728"/>
        <line x1="720" y1="719" x2="724" y2="719"/>
        <line x1="720" y1="724" x2="723" y2="724"/>
        <rect x="700" y="736" width="40" height="20" rx="2" strokeWidth="0.8"
          fill="currentColor" fillOpacity="0.12"/>
        <text x="720" y="747" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">F-12</text>
        <text x="720" y="754" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">SANDTON</text>
      </g>

      {/* G-04 · WOODSTOCK — fourth band, mid-left */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="420" y1="970" x2="420" y2="982" strokeWidth="0.6"/>
        <circle cx="420" cy="988" r="5"/>
        <circle cx="420" cy="988" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="420" y1="993" x2="420" y2="1010"/>
        <line x1="420" y1="1001" x2="424" y2="1001"/>
        <line x1="420" y1="1006" x2="423" y2="1006"/>
        <rect x="400" y="1018" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="420" y="1029" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">G-04</text>
        <text x="420" y="1036" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">WOODSTOCK</text>
      </g>

      {/* H-09 · GREENPOINT — fourth band, far right */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="1020" y1="970" x2="1020" y2="982" strokeWidth="0.6"/>
        <circle cx="1020" cy="988" r="5"/>
        <circle cx="1020" cy="988" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="1020" y1="993" x2="1020" y2="1010"/>
        <line x1="1020" y1="1001" x2="1024" y2="1001"/>
        <line x1="1020" y1="1006" x2="1023" y2="1006"/>
        <rect x="1000" y="1018" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="1020" y="1029" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">H-09</text>
        <text x="1020" y="1036" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">GREENPOINT</text>
      </g>

      {/* J-07 · ROSEBANK — fifth band, mid-left */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="220" y1="1250" x2="220" y2="1262" strokeWidth="0.6"/>
        <circle cx="220" cy="1268" r="5"/>
        <circle cx="220" cy="1268" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="220" y1="1273" x2="220" y2="1290"/>
        <line x1="220" y1="1281" x2="224" y2="1281"/>
        <line x1="220" y1="1286" x2="223" y2="1286"/>
        <rect x="200" y="1298" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="220" y="1309" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">J-07</text>
        <text x="220" y="1316" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">ROSEBANK</text>
      </g>

      {/* K-11 · DBN POINT — fifth band, mid-right */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="820" y1="1250" x2="820" y2="1262" strokeWidth="0.6"/>
        <circle cx="820" cy="1268" r="5"/>
        <circle cx="820" cy="1268" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="820" y1="1273" x2="820" y2="1290"/>
        <line x1="820" y1="1281" x2="824" y2="1281"/>
        <line x1="820" y1="1286" x2="823" y2="1286"/>
        <rect x="800" y="1298" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="820" y="1309" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">K-11</text>
        <text x="820" y="1316" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">DBN POINT</text>
      </g>

      {/* L-06 · UMHLANGA — bottom band, mid */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="520" y1="1530" x2="520" y2="1542" strokeWidth="0.6"/>
        <circle cx="520" cy="1548" r="5"/>
        <circle cx="520" cy="1548" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="520" y1="1553" x2="520" y2="1570"/>
        <line x1="520" y1="1561" x2="524" y2="1561"/>
        <line x1="520" y1="1566" x2="523" y2="1566"/>
        <rect x="500" y="1578" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="520" y="1589" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">L-06</text>
        <text x="520" y="1596" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">UMHLANGA</text>
      </g>

      {/* M-14 · OBSERVATORY — bottom band, right */}
      <g stroke="currentColor" strokeWidth="0.9" fill="none">
        <line x1="920" y1="1530" x2="920" y2="1542" strokeWidth="0.6"/>
        <circle cx="920" cy="1548" r="5"/>
        <circle cx="920" cy="1548" r="1.6" fill="currentColor" fillOpacity="0.5" stroke="none"/>
        <line x1="920" y1="1553" x2="920" y2="1570"/>
        <line x1="920" y1="1561" x2="924" y2="1561"/>
        <line x1="920" y1="1566" x2="923" y2="1566"/>
        <rect x="900" y="1578" width="40" height="20" rx="2" strokeWidth="0.8"/>
        <text x="920" y="1589" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="6.5" fill="currentColor" stroke="none">M-14</text>
        <text x="920" y="1596" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
          fontSize="5" fill="currentColor" fillOpacity="0.75" stroke="none">OBSERVATORY</text>
      </g>

    </svg>
  )
}