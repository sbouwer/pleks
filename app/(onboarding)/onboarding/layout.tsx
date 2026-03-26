import Image from "next/image"
import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // If authenticated and already has an org, go to dashboard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Use service client to bypass RLS (user_orgs policy causes recursion)
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (membership) redirect("/dashboard")
  }

  // Unauthenticated users CAN access onboarding —
  // they create their account in the final step

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-border bg-surface">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo.svg" alt="Pleks" width={86} height={24} className="h-6 w-auto" />
            <span className="text-xs text-muted-foreground">Setup</span>
          </Link>
        </div>
      </div>
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
    </div>
  )
}
