/**
 * components/marketing/charter/SealMark.tsx — wax-seal stamp for charter cards
 *
 * Notes:  Dual-ring circular stamp, rotated -8deg, amber at variable opacity.
 *         Opacity is driven by parent hover via CSS in charter.module.css.
 *         Two variants: regular (48px) and featured (64px).
 *         Register variant uses "REGISTER" + section (version) labels instead of "ATTESTED".
 */
import styles from "./charter.module.css"

interface SealMarkProps {
  section: string  // "§01", "§02", …
  featured?: boolean
  register?: boolean
}

export function SealMark({ section, featured = false, register = false }: SealMarkProps) {
  const size = featured ? 64 : 48
  const cx = size / 2
  const outerR = cx - 1.5
  const innerR = outerR - 5
  const labelTop = register ? "REGISTER" : "ATTESTED"
  const labelBot = section
  const fontSize = featured ? 7 : 5.5
  const botFontSize = featured ? 6.5 : 5

  return (
    <svg
      className={`${styles.sealMark}${featured ? ` ${styles.sealMarkFeatured}` : ""}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx={cx} cy={cx} r={outerR} fill="none" stroke="var(--amber-ink)" strokeWidth="1"/>
      {/* Inner ring */}
      <circle cx={cx} cy={cx} r={innerR} fill="none" stroke="var(--amber-ink)" strokeWidth="0.6"/>
      {/* Horizontal divider */}
      <line
        x1={cx - innerR * 0.6} y1={cx}
        x2={cx + innerR * 0.6} y2={cx}
        stroke="var(--amber-ink)" strokeWidth="0.6"
      />
      {/* Top label */}
      <text
        x={cx} y={cx - 3}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        fill="var(--amber-ink)"
        fontFamily="var(--pub-mono)"
        fontSize={fontSize}
        fontWeight="600"
        letterSpacing="0.12em"
      >
        {labelTop}
      </text>
      {/* Bottom label */}
      <text
        x={cx} y={cx + botFontSize + 3}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        fill="var(--amber-ink)"
        fontFamily="var(--pub-mono)"
        fontSize={botFontSize}
        fontWeight="500"
        letterSpacing="0.08em"
      >
        {labelBot}
      </text>
    </svg>
  )
}
