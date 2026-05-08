"use server"

/**
 * app/(auth)/accept-terms/actions.ts — ToS acceptance server action
 *
 * Auth:   authenticated user (createClient); no org gate (skipOrgCheck route)
 * Data:   tos_acceptances (insert via recordTosAcceptance); sets pleks_tos_version cookie
 * Notes:  Sets cookie after DB write — cookie is the fast-path gate in proxy.ts;
 *         DB row is the evidentiary record for POPIA s17 accountability.
 */
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordTosAcceptance } from "@/lib/subscriptions/acceptance"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { AUTH_COOKIE_OPTS } from "@/lib/auth/cookie-config"

export async function acceptCurrentTerms(nextPath: string): Promise<never> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") ?? null
  const ua = headersList.get("user-agent") ?? null

  await recordTosAcceptance(service, membership.org_id, user.id, user.email ?? "", ip, ua, "version_update")

  const cookieStore = await cookies()
  cookieStore.set("pleks_tos_version", LEGAL_VERSIONS.terms, {
    ...AUTH_COOKIE_OPTS,
    maxAge: 60 * 60 * 24 * 365,
  })

  const dest = nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard"
  redirect(dest)
}
