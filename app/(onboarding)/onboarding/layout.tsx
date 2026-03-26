import Image from "next/image"
import Link from "next/link"

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — just logo */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo.svg" alt="Pleks" width={86} height={24} className="h-6 w-auto" />
            <span className="text-xs text-muted-foreground">Setup</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  )
}
