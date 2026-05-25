/**
 * components/marketing/charter/artefacts/ArtefactBreachClock.tsx
 * §08 Breach Posture — PLEKS 24H (amber) vs POPIA 72H (neutral)
 * Numbers sit below each clock face so the hand never strikes through them.
 */
export function ArtefactBreachClock() {
  // Clock hand endpoints — both start from circle center, point outward.
  // PLEKS hand at ~1 o'clock (fast response): sin30=0.5, cos30=0.866
  const pCx = 44, pCy = 22, r = 14
  const pHx = pCx + r * 0.5 * 0.85        // ~49.9
  const pHy = pCy - r * 0.866 * 0.85      // ~11.7

  // POPIA hand at ~3 o'clock (much slower): sin90=1, cos90=0
  const oCx = 156, oCy = 22
  const oHx = oCx + r * 0.85              // ~167.9
  const oHy = oCy                         // same height as center

  return (
    <svg
      viewBox="0 0 200 58"
      width="100%"
      height="58"
      role="img"
      aria-label="Two clocks: Pleks commits to 24-hour breach notification versus POPIA's required 72 hours"
    >
      {/* ── PLEKS clock ── */}
      <text x={pCx} y="7" fontFamily="var(--pub-mono)" fontSize="5.5" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">PLEKS</text>
      <circle cx={pCx} cy={pCy} r={r} fill="none" stroke="var(--amber-ink)" strokeWidth="1.2"/>
      {/* 12 o'clock tick */}
      <line x1={pCx} y1={pCy - r} x2={pCx} y2={pCy - r + 3} stroke="var(--amber-ink)" strokeWidth="1" strokeLinecap="round"/>
      {/* Center dot */}
      <circle cx={pCx} cy={pCy} r="1.5" fill="var(--amber-ink)"/>
      {/* Hand — 1 o'clock, doesn't cross number below */}
      <line x1={pCx} y1={pCy} x2={pHx} y2={pHy} stroke="var(--amber-ink)" strokeWidth="1.4" strokeLinecap="round"/>
      {/* Hour label below face */}
      <text x={pCx} y="46" fontFamily="var(--pub-mono)" fontSize="11" fontWeight="700" fill="var(--amber-ink)" textAnchor="middle">24</text>
      <text x={pCx} y="56" fontFamily="var(--pub-mono)" fontSize="6" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.06em">hours</text>

      {/* ── VS ── */}
      <text x="100" y={pCy + 2} fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.25" textAnchor="middle" letterSpacing="0.06em">VS</text>

      {/* ── POPIA clock ── */}
      <text x={oCx} y="7" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.35" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">POPIA</text>
      <circle cx={oCx} cy={oCy} r={r} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
      {/* 12 o'clock tick */}
      <line x1={oCx} y1={oCy - r} x2={oCx} y2={oCy - r + 3} stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      {/* Center dot */}
      <circle cx={oCx} cy={oCy} r="1.5" fill="currentColor" opacity="0.3"/>
      {/* Hand — 3 o'clock */}
      <line x1={oCx} y1={oCy} x2={oHx} y2={oHy} stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      {/* Hour label below face */}
      <text x={oCx} y="46" fontFamily="var(--pub-mono)" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.4" textAnchor="middle">72</text>
      <text x={oCx} y="56" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.35" textAnchor="middle" letterSpacing="0.06em">hours</text>
    </svg>
  )
}
