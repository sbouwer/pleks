/**
 * app/(dashboard)/hoa/layout.tsx — HOA product-line route guard
 *
 * Auth:  HOA product line ONLY (redirect /403 otherwise) + 'properties' capability (owner/is_admin exempt).
 * Notes: 2026-07-10 product ruling (supersedes ADDENDUM_18C NR-1): HOA is a STANDALONE service, never
 *        bundled into a rental-agent package. No residential tier — Firm included — reaches this surface.
 *        The gate is the PRODUCT LINE, not the tier: a tier floor would GRANT Firm orgs access, which is
 *        exactly what the ruling removes (hence "/hoa" is absent from ROUTE_TIER_FLOORS, where a null
 *        floor means no gate at all). Until the hoa_manager line can be provisioned (Stage 4, post-launch)
 *        this surface is intentionally unreachable — the standalone HOA product gets its own build.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getOrgTierAny } from "@/lib/tier/getOrgTier"
import { productLineForTier } from "@/lib/tier/gates"
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const tier = await getOrgTierAny(gw.orgId)
  if (productLineForTier(tier) !== "hoa") redirect("/403")

  await requireCapability("properties")
  return children
}
