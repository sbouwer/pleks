/**
 * components/marketing/charter/CharterCard.tsx — single commitment card
 *
 * Notes:  Handles both regular and featured (§01) variants via `featured` prop.
 *         Renders as a Next.js Link — each card links to its legal article.
 *         Server component — no JS, hover handled by CSS in charter.module.css.
 *         Spec: BUILD_66_CHARTER_HOMEPAGE.md §7.2
 */
import type { ComponentType } from "react"
import Link from "next/link"
import styles from "./charter.module.css"
import { SealMark } from "./SealMark"

interface CharterCardProps {
  num: number
  label: string
  featured?: boolean
  title: string
  body: string
  foot: string
  hover: string
  href: string
  Artefact: ComponentType
}

export function CharterCard({
  num,
  label,
  featured = false,
  title,
  body,
  foot,
  hover,
  href,
  Artefact,
}: Readonly<CharterCardProps>) {
  const numStr = String(num).padStart(2, "0")
  const cardClass = [
    styles.charterCard,
    featured ? styles.charterCardFeatured : "",
  ].filter(Boolean).join(" ")

  return (
    <Link
      href={href}
      className={cardClass}
      aria-label={`Charter commitment ${num}: ${title}`}
    >
      <SealMark section={`§${numStr}`} featured={featured} />

      <div className={styles.cardHead}>
        <span className={styles.cardNum}>{label}</span>
        <span className={styles.cardOf}>N° {numStr} / 08</span>
      </div>

      <div className={styles.cardArtefact}>
        <Artefact />
      </div>

      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardBody}>{body}</p>

      <div className={styles.cardFoot}>
        <span className={styles.cardFootText}>{foot}</span>
        <span className={styles.cardHoverAffordance} aria-hidden="true">
          {hover} →
        </span>
      </div>
    </Link>
  )
}
