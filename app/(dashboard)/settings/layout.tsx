/**
 * app/(dashboard)/settings/layout.tsx — shared chrome for every /settings/* page
 *
 * Route:  /settings/**
 * Auth:   inherits the dashboard layout's gate
 * Notes:  Mounts the mobile back-link + the usage recorder (bumps per-device visit counts that feed the
 *         Overview "Frequently used" cards — lib/settings/usage).
 */
import { MobileSettingsBackLink } from "@/components/mobile/MobileSettingsBackLink"
import { SettingsUsageRecorder } from "@/components/settings/SettingsUsageRecorder"

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <MobileSettingsBackLink />
      <SettingsUsageRecorder />
      {children}
    </>
  )
}
