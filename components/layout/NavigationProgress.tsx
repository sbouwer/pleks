"use client"

/**
 * components/layout/NavigationProgress.tsx — top-of-page route-change progress bar (next-nprogress-bar, brand colour)
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
