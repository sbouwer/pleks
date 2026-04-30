"use client"

/**
 * components/layout/NavigationProgress.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { AppProgressBar } from "next-nprogress-bar"

export function NavigationProgress() {
  return (
    <AppProgressBar
      height="2px"
      color="var(--color-brand)"
      options={{ showSpinner: false }}
      shallowRouting
    />
  )
}
