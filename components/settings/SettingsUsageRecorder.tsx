"use client"

/**
 * components/settings/SettingsUsageRecorder.tsx — records Settings page visits (Frequently used)
 *
 * Notes:  Mounted in the settings layout so every /settings/* navigation bumps the per-device visit count
 *         (lib/settings/usage). Renders nothing.
 */
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { recordSettingsVisit } from "@/lib/settings/usage"

export function SettingsUsageRecorder() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) recordSettingsVisit(pathname)
  }, [pathname])
  return null
}
