/**
 * components/ui/AccentBracket.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
