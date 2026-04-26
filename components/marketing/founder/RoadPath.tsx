// SVG road path and pins — server component, no client JS.
// Coordinate space: 1160 × stageH (matches FounderTimeline's STAGE_W and ROW_H * 6).

type Pos = { pinX: number; pinY: number }
type Phase = "slate" | "amber" | "now"

// ── Path builder ─────────────────────────────────────────────────────────────
// Builds a single orthogonal path with 20px rounded corners threading between
// all moment pins. Two distinct centre-column values (cL and cR) keep the
// vertical segments separate so the path doesn't visually stack on itself.

function buildPath(positions: Pos[]): string {
  const r = 20    // corner radius
  const cL = 490  // centre column for left → right transitions
  const cR = 670  // centre column for right → left transitions

  if (positions.length < 2) return ""

  let d = `M ${positions[0].pinX} ${positions[0].pinY}`

  for (let i = 0; i < positions.length - 1; i++) {
    const p1 = positions[i]
    const p2 = positions[i + 1]

    if (p2.pinX > p1.pinX) {
      // Left card → Right card (threading through cL)
      d += ` L ${cL - r} ${p1.pinY}`
      d += ` Q ${cL} ${p1.pinY} ${cL} ${p1.pinY + r}`
      d += ` L ${cL} ${p2.pinY - r}`
      d += ` Q ${cL} ${p2.pinY} ${cL + r} ${p2.pinY}`
      d += ` L ${p2.pinX} ${p2.pinY}`
    } else {
      // Right card → Left card (threading through cR)
      d += ` L ${cR + r} ${p1.pinY}`
      d += ` Q ${cR} ${p1.pinY} ${cR} ${p1.pinY + r}`
      d += ` L ${cR} ${p2.pinY - r}`
      d += ` Q ${cR} ${p2.pinY} ${cR - r} ${p2.pinY}`
      d += ` L ${p2.pinX} ${p2.pinY}`
    }
  }

  return d
}

// ── Arrow head ────────────────────────────────────────────────────────────────

const ARROW_ID = "fd-arrow"

function ArrowMarker() {
  return (
    <defs>
      <marker id={ARROW_ID} viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="5" markerHeight="5" orient="auto">
        <path d="M 0 1 L 9 5 L 0 9 Z" fill="var(--amber-ink)" />
      </marker>
    </defs>
  )
}

// ── RoadPath ──────────────────────────────────────────────────────────────────

export function RoadPath({
  positions,
  phases,
  stageW,
  stageH,
}: {
  positions: Pos[]
  phases: Phase[]
  stageW: number
  stageH: number
}) {
  const d = buildPath(positions)
  const last = positions[positions.length - 1]
  const arrowEndX = last.pinX + 64

  return (
    <svg
      viewBox={`0 0 ${stageW} ${stageH}`}
      width="100%"
      height={stageH}
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <ArrowMarker />

      {/* ── Base solid stroke ─────────────────────────── */}
      <path
        d={d}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.65}
      />

      {/* ── Dashed amber overlay (same path) ─────────── */}
      <path
        d={d}
        fill="none"
        stroke="var(--amber-ink)"
        strokeWidth={1}
        strokeLinecap="round"
        strokeDasharray="2 8"
        opacity={0.45}
      />

      {/* ── Trailing arrow beyond final card ─────────── */}
      <line
        x1={last.pinX}
        y1={last.pinY}
        x2={arrowEndX}
        y2={last.pinY}
        stroke="var(--amber-ink)"
        strokeWidth={2}
        opacity={0.6}
        markerEnd={`url(#${ARROW_ID})`}
      />

      {/* ── Pins ─────────────────────────────────────── */}
      {positions.map((pos, i) => {
        const phase = phases[i]
        const isNow = phase === "now"
        const isAmber = phase === "amber" || isNow
        const stroke = isAmber ? "var(--amber-ink)" : "var(--rule-strong)"
        let sw = 1.5
        if (isNow) sw = 2.5
        else if (isAmber) sw = 2
        return (
          <circle
            key={i}
            cx={pos.pinX}
            cy={pos.pinY}
            r={7}
            fill="var(--amber)"
            stroke={stroke}
            strokeWidth={sw}
          />
        )
      })}
    </svg>
  )
}
