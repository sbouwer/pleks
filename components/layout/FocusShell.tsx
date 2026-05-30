"use client"

/**
 * components/layout/FocusShell.tsx — Branded full-screen auth backdrop + centred content
 *
 * Notes:  Warm onboarding-style shell used by the focused auth screens (login, /login/mfa).
 *         The fixed .fs-shell backdrop covers the marketing nav so these screens read as a
 *         distinct, branded auth surface rather than a card dropped on a marketing page.
 */
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/components/layout/focus-shell.css"

export function FocusShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="fs-shell">
      <FocusBackdrop />
      <div className="fs-content">{children}</div>
    </div>
  )
}
