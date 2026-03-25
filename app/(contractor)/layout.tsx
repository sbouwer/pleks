import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function ContractorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login?role=contractor")

  // Verify user is a contractor
  const { data: contractor } = await supabase
    .from("contractors")
    .select("id, name, company_name")
    .eq("auth_user_id", user.id)
    .eq("portal_access_enabled", true)
    .limit(1)
    .single()

  if (!contractor) redirect("/login")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/contractor" className="flex items-center gap-2">
            <Image src="/logo-mark.svg" alt="Pleks" width={24} height={24} />
            <span className="font-heading text-lg">Pleks</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/contractor" className="text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/contractor/jobs" className="text-muted-foreground hover:text-foreground transition-colors">
              Jobs
            </Link>
            <Link href="/contractor/invoices" className="text-muted-foreground hover:text-foreground transition-colors">
              Invoices
            </Link>
            <Link href="/contractor/profile" className="text-muted-foreground hover:text-foreground transition-colors">
              Profile
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
