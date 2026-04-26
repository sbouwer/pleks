import type { MomentData } from "./FounderTimeline"
import styles from "./founder.module.css"

/** Render `body`, wrapping the first occurrence of `highlight` in an amber-wash span. */
function renderBody(body: string, highlight?: string) {
  if (!highlight) return body
  const i = body.indexOf(highlight)
  if (i === -1) return body
  return (
    <>
      {body.slice(0, i)}
      <span className="amber-wash-underline">{highlight}</span>
      {body.slice(i + highlight.length)}
    </>
  )
}

export function FounderMoment({ moment }: { moment: MomentData }) {
  const tagCls = moment.tagColour === "amber" ? styles.tagAmber : styles.tagSlate

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.tag} ${tagCls}`}>{moment.tag}</span>
        <span className={styles.year}>{moment.year}</span>
      </div>
      <p className={styles.cardTitle}>{moment.title}</p>
      <p className={styles.cardBody}>{renderBody(moment.body, moment.bodyHighlight)}</p>
      <p className={styles.cardFoot}>{moment.foot}</p>
    </div>
  )
}
