/**
 * components/ui/Wordmark.tsx — the Pleks wordmark ("plek" + amber-bracketed "s" + stoep underline)
 *
 * Notes:  Single source for the wordmark MARKUP (the look lives in .pub-wordmark / .accent-bracket in
 *         globals.css). Renders as an external <a> (href + external — e.g. the marketing site), an internal
 *         next/link (href only), or a plain <span> (no href). Pass style for per-placement size/spacing.
 *         Replaces the markup that was inlined across ~11 nav/auth/shell surfaces.
 */
import Link from "next/link"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { AccentBracket } from "@/components/ui/AccentBracket"

interface WordmarkProps {
  /** When set, the wordmark is a link. Omit for a plain <span>. */
  href?: string
  /** Render the link as a plain <a> (external, e.g. the marketing site) instead of next/link. */
  external?: boolean
  className?: string
  style?: CSSProperties
}

export function Wordmark({ href, external, className, style }: Readonly<WordmarkProps>) {
  const inner = <span className="pub-wm-name">plek<AccentBracket>s</AccentBracket></span>
  const cls = cn("pub-wordmark", className)

  if (href && external) {
    return <a href={href} className={cls} aria-label="Pleks" style={style}>{inner}</a>
  }
  if (href) {
    return <Link href={href} className={cls} aria-label="Pleks" style={style}>{inner}</Link>
  }
  return <span className={cls} aria-label="Pleks" style={style}>{inner}</span>
}
