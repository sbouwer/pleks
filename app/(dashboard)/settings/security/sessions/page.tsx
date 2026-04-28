/**
 * app/(dashboard)/settings/security/sessions/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { SessionsView } from "@/components/auth/SessionsView"

export const metadata = { title: "Your sessions" }

export default async function SessionsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  return <SessionsView userId={gw.userId} selfOnly />
}
