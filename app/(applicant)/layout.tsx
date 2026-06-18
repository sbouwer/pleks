/**
 * app/(applicant)/layout.tsx — shell for the public applicant surface (Wordmark header + centred content)
 *
 * Route:  /apply/* (applicant-facing)
 * Auth:   public (token-gated listing slugs)
 * Notes:  Minimal branded chrome — a Wordmark header over a max-w-xl centred content column.
 */
import { Wordmark } from "@/components/ui/Wordmark"

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
          <Wordmark style={{ fontSize: 22 }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  )
}
