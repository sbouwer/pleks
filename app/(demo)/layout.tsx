/**
 * app/(demo)/layout.tsx — demo route group guard
 *
 * Auth:   public; redirects to /dashboard if user already has an org membership
 * Notes:  Intentionally uses createClient (auth.getUser only — no DB queries).
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// /demo is an APEX_PREFIX served from www.pleks.co.za — suppress the PWA manifest
// (its start_url is on app.pleks.co.za) to avoid the cross-origin start_url warning.
export const metadata = { manifest: null }

export default async function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Guard: if user already has an org, redirect to real dashboard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (membership) redirect("/dashboard")
  }

  return <>{children}</>
}
