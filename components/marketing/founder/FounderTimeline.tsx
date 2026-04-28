/**
 * components/marketing/founder/FounderTimeline.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { FounderMoment } from "./FounderMoment"
import { RoadPath } from "./RoadPath"
import styles from "./founder.module.css"

export type MomentData = {
  id: number
  side: "left" | "right"
  year: string
  tag: string
  tagColour: "slate" | "amber"
  title: string
  body: string
  /** Optional substring of `body` to wrap in `.amber-wash-underline`. Must match exactly. */
  bodyHighlight?: string
  foot: string
  phase: "slate" | "amber" | "now"
}

// ── Fixed geometry (server-computed, coordinate space = SVG viewBox) ─────────
const STAGE_W = 1160  // matches pub-wrap inner width at desktop (1240 – 2×32px pad ≈ 1176; use 1160 for safety)
const LEFT_PIN_X = 380
const RIGHT_PIN_X = 780  // STAGE_W − LEFT_PIN_X
const ROW_H = 280
const PIN_Y_OFFSET = 140  // pin sits at vertical centre of each row (ROW_H / 2)

export function FounderTimeline({ moments }: { moments: MomentData[] }) {
  const stageH = moments.length * ROW_H

  const positions = moments.map((m, i) => ({
    pinX: m.side === "left" ? LEFT_PIN_X : RIGHT_PIN_X,
    pinY: i * ROW_H + PIN_Y_OFFSET,
  }))

  const phases = moments.map((m) => m.phase)

  return (
    <div className={styles.stage} style={{ height: stageH }}>
      {/* Road SVG — absolutely behind the cards */}
      <div className={styles.road}>
        <RoadPath
          positions={positions}
          phases={phases}
          stageW={STAGE_W}
          stageH={stageH}
        />
      </div>

      {/* Moment cards */}
      {moments.map((moment, i) => (
        <div
          key={moment.id}
          className={`${styles.momentRow} ${moment.side === "left" ? styles.left : styles.right}`}
          style={{ top: i * ROW_H, height: ROW_H }}
        >
          <FounderMoment moment={moment} />
        </div>
      ))}
    </div>
  )
}
