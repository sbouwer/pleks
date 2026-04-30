/**
 * app/(applicant)/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Image from "next/image"

export default function ApplicantLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-xl mx-auto px-4 py-5 flex justify-center">
          <Image src="/logo.svg" alt="Pleks" width={114} height={32} className="h-8 w-auto" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  )
}
