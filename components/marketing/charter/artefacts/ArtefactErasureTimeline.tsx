/**
 * components/marketing/charter/artefacts/ArtefactErasureTimeline.tsx
 * §05 Right to be Forgotten — D0 → D14 → D30 erasure timeline
 */
export function ArtefactErasureTimeline() {
  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Erasure timeline from Day 0 request through Day 14 carve-outs to Day 30 erased, with FICA, PPRA, and Tribunal holds disclosed"
    >
      {/* Timeline rail */}
      <line x1="20" y1="24" x2="180" y2="24" stroke="currentColor" strokeWidth="0.8" opacity="0.2"/>

      {/* D0 */}
      <circle cx="20" cy="24" r="3.5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
      <text x="20" y="14" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.55" textAnchor="middle" fontWeight="600">D 0</text>
      <text x="20" y="38" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.4" textAnchor="middle">REQUEST</text>

      {/* D14 */}
      <circle cx="100" cy="24" r="3.5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
      <text x="100" y="14" fontFamily="var(--pub-mono)" fontSize="6.5" fill="currentColor" opacity="0.55" textAnchor="middle" fontWeight="600">D 14</text>
      <text x="100" y="38" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.4" textAnchor="middle">CARVE-OUTS</text>

      {/* D30 — amber punchline */}
      <circle cx="180" cy="24" r="4" fill="var(--amber-ink)" fillOpacity="0.15" stroke="var(--amber-ink)" strokeWidth="1"/>
      <text x="180" y="14" fontFamily="var(--pub-mono)" fontSize="6.5" fill="var(--amber-ink)" textAnchor="middle" fontWeight="700">D 30</text>
      <text x="180" y="38" fontFamily="var(--pub-mono)" fontSize="5.5" fill="var(--amber-ink)" textAnchor="middle" fontWeight="600">ERASED</text>

      {/* Divider */}
      <line x1="0" y1="46" x2="200" y2="46" stroke="currentColor" strokeWidth="0.4" opacity="0.15"/>

      {/* Carve-outs subscript */}
      <text x="100" y="54" fontFamily="var(--pub-mono)" fontSize="5.5" fill="currentColor" opacity="0.35" textAnchor="middle" letterSpacing="0.06em">FICA · PPRA · TRIBUNAL HOLDS</text>
    </svg>
  )
}
