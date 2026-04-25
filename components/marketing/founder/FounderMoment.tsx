import type { MomentData } from "./FounderTimeline"
import styles from "./founder.module.css"

export function FounderMoment({ moment }: { moment: MomentData }) {
  const tagCls = moment.tagColour === "amber" ? styles.tagAmber : styles.tagSlate

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.tag} ${tagCls}`}>{moment.tag}</span>
        <span className={styles.year}>{moment.year}</span>
      </div>
      <p className={styles.cardTitle}>{moment.title}</p>
      <p className={styles.cardBody}>{moment.body}</p>
      <p className={styles.cardFoot}>{moment.foot}</p>
    </div>
  )
}
