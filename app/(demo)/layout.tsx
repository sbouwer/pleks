/**
 * app/(demo)/layout.tsx — demo route group guard
 *
 * Auth:   public; checks org membership via gatewaySSR and redirects to /dashboard if the user already has an org
 * Notes:  gatewaySSR resolves to non-null only when the user is authenticated AND has an org membership.
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"

// /demo is an APEX_PREFIX served from www.pleks.co.za — suppress the PWA manifest
// (its start_url is on app.pleks.co.za) to avoid the cross-origin start_url warning.
export const metadata = { manifest: null }

export default async function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Guard: if user already has an org, redirect to real dashboard
  const gw = await gatewaySSR()
  if (gw) redirect("/dashboard")

  return <>{children}</>
}
