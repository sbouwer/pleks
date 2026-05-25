/**
 * components/marketing/charter/artefacts/ArtefactNoTracking.tsx
 * §06 No Tracking — analytics vendors crossed out, TOTAL · 0
 */
export function ArtefactNoTracking() {
  const vendors = ["Mixpanel", "Amplitude", "GA4", "Hotjar", "Segment", "FullStory"]

  return (
    <svg
      viewBox="0 0 200 56"
      width="100%"
      height="56"
      role="img"
      aria-label="Six analytics products crossed out: Mixpanel, Amplitude, GA4, Hotjar, Segment, FullStory — total zero analytics vendors deployed"
    >
      {/* Row 1: Mixpanel, Amplitude, GA4 */}
      {vendors.slice(0, 3).map((v, i) => {
        const x = 6 + i * 64
        const y = 14
        return (
          <g key={v}>
            <text x={x} y={y} fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.35">{v}</text>
            <line
              x1={x - 2} y1={y - 5}
              x2={x + v.length * 4.2 + 2} y2={y - 5}
              stroke="currentColor" strokeWidth="0.8" opacity="0.35"
            />
          </g>
        )
      })}

      {/* Row 2: Hotjar, Segment, FullStory */}
      {vendors.slice(3).map((v, i) => {
        const x = 6 + i * 64
        const y = 30
        return (
          <g key={v}>
            <text x={x} y={y} fontFamily="var(--pub-mono)" fontSize="7" fill="currentColor" opacity="0.35">{v}</text>
            <line
              x1={x - 2} y1={y - 5}
              x2={x + v.length * 4.2 + 2} y2={y - 5}
              stroke="currentColor" strokeWidth="0.8" opacity="0.35"
            />
          </g>
        )
      })}

      {/* Divider */}
      <line x1="0" y1="38" x2="200" y2="38" stroke="currentColor" strokeWidth="0.5" opacity="0.18"/>

      {/* TOTAL · 0 punchline */}
      <text x="8" y="52" fontFamily="var(--pub-mono)" fontSize="9" fill="var(--amber-ink)" fontWeight="700" letterSpacing="0.06em">TOTAL · 0</text>
      <text x="90" y="52" fontFamily="var(--pub-mono)" fontSize="6" fill="currentColor" opacity="0.35">analytics vendors deployed</text>
    </svg>
  )
}
