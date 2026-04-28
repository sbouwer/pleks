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
