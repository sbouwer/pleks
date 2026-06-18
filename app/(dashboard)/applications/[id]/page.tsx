/**
 * app/(dashboard)/applications/[id]/page.tsx — legacy redirect shim for the renamed Listings IA
 *
 * Route:  /applications/[id]  (legacy — canonical is /listings/[slug]/applications/[id])
 * Auth:   gatewaySSR (agent workspace)
 * Data:   applications → listings(public_slug)
 * Notes:  /applications was renamed to /listings (each listing has applicants). This shim keeps old deep
 *         links (review emails, bookmarks) alive by resolving the application's listing slug and redirecting
 *         to the canonical nested route. The bare /applications + /applications/compare are handled by
 *         next.config redirects; only the slug-bearing [id] needs a server lookup, so it lives here.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function LegacyApplicationRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { data, error } = await gw.db
    .from("applications")
    .select("listings(public_slug)")
    .eq("id", id)
    .eq("org_id", gw.orgId)
    .maybeSingle()
  if (error) logQueryError("LegacyApplicationRedirect lookup", error)

  const raw = (data as { listings?: unknown } | null)?.listings
  const listing = (Array.isArray(raw) ? raw[0] : raw) as { public_slug: string | null } | null | undefined
  redirect(listing?.public_slug ? `/listings/${listing.public_slug}/applications/${id}` : "/listings")
}
