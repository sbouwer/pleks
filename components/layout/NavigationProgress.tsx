"use client"

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
