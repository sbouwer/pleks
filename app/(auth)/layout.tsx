/**
 * app/(auth)/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { PortalThemeProvider } from "@/components/layout/PortalThemeProvider"

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalThemeProvider>
      <div className="min-h-screen bg-background flex flex-col">
        {children}
      </div>
    </PortalThemeProvider>
  )
}
