"use client"

/**
 * components/settings/SettingsUsageRecorder.tsx — records Settings page visits (Frequently used)
 *
 * Notes:  Mounted in the settings layout so every /settings/* navigation bumps the per-(user, org) visit
 *         count (lib/settings/uiState → settings_ui_state). Fire-and-forget; renders nothing.
 */
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { recordSettingsVisit } from "@/lib/settings/uiState"

export function SettingsUsageRecorder() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) recordSettingsVisit(pathname).catch(() => { /* best-effort */ })
  }, [pathname])
  return null
}
