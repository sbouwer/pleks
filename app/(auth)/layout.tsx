/**
 * app/(auth)/layout.tsx — Minimal layout for auth and pre-dashboard flows
 *
 * Route:  /login, /register, /forgot-password, /reset-password, /accept-terms
 * Auth:   none (routes handle their own auth checks)
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
