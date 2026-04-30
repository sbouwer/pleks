/**
 * app/(dashboard)/settings/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { MobileSettingsBackLink } from "@/components/mobile/MobileSettingsBackLink"

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <MobileSettingsBackLink />
      {children}
    </>
  )
}
