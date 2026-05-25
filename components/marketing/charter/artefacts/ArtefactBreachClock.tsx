/**
 * components/marketing/charter/artefacts/ArtefactBreachClock.tsx
 * §08 Breach Posture — PLEKS 24H (amber) vs POPIA 72H (neutral)
 */
export function ArtefactBreachClock() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Two clocks: Pleks commits to 24-hour breach notification versus POPIA's required 72 hours"
    >
      {/* PLEKS clock — amber */}
      <circle cx="44" cy="26" r="20" fill="none" stroke="var(--amber-ink)" strokeWidth="1.2"/>
      <circle cx="44" cy="26" r="1.5" fill="var(--amber-ink)"/>
      {/* Clock hand at 8 o'clock position (~240deg) */}
      <line x1="44" y1="26" x2="33" y2="36" stroke="var(--amber-ink)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* 12 tick */}
      <line x1="44" y1="7" x2="44" y2="10" stroke="var(--amber-ink)" strokeWidth="1" strokeLinecap="round"/>
      <text x="44" y="30" fontFamily="var(--pub-mono)" fontSize="11" fontWeight="700" fill="var(--amber-ink)" textAnchor="middle">24</text>
      <text x="44" y="6" fontFamily="var(--pub-mono)" fontSize="5.5" fill="var(--amber-ink)" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">PLEKS</text>
      <text x="44" y="52" fontFamily="var(--pub-mono)" fontSize="7" fill="var(--amber-ink)" textAnchor="middle" fontWeight="600">H</text>

      {/* VS */}
      <text x="100" y="30" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.25" textAnchor="middle" letterSpacing="0.06em">VS</text>

      {/* POPIA clock — neutral */}
      <circle cx="156" cy="26" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
      <circle cx="156" cy="26" r="1.5" fill="currentColor" opacity="0.3"/>
      {/* Clock hand at ~11 o'clock (330deg) */}
      <line x1="156" y1="26" x2="148" y2="10" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      {/* 12 tick */}
      <line x1="156" y1="7" x2="156" y2="10" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      <text x="156" y="30" fontFamily="var(--pub-mono)" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.4" textAnchor="middle">72</text>
      <text x="156" y="6" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.35" textAnchor="middle" letterSpacing="0.1em" fontWeight="700">POPIA</text>
      <text x="156" y="52" fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.4" textAnchor="middle" fontWeight="600">H</text>
    </svg>
  )
}
