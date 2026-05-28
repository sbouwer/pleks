/**
 * components/ui/AccentBracket.tsx — Amber top-right corner bracket accent for wordmark and headings
 *
 * Notes:  Wraps a letter with .accent-bracket + .accent-bracket-mark (CSS in globals.css).
 *         Works in any context where --amber is defined (app dark, public light/dark, portal).
 */
import type { ReactNode } from "react"

/**
 * Wraps a letter (or short string) with an amber top-right corner bracket.
 * Works in any context where --amber is defined (app dark, public light/dark).
 *
 * Usage:
 *   <AccentBracket>s</AccentBracket>
 *   <h2>Prop<AccentBracket>e</AccentBracket>rty</h2>
 */
export function AccentBracket({ children }: { children: ReactNode }) {
  return (
    <span className="accent-bracket">
      {children}
      <span className="accent-bracket-mark" aria-hidden="true" />
    </span>
  )
}
