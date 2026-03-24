export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl text-brand">Pleks</h1>
          <p className="text-muted-foreground text-sm mt-1">Set up your organisation</p>
        </div>
        {children}
      </div>
    </div>
  )
}
