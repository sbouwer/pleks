/**
 * app/(dashboard)/hoa/layout.tsx — RBAC P4 route guard
 *
 * Auth:  'properties' capability (owner/is_admin exempt) + Firm tier (NOT exempt — it's a plan feature).
 * Notes: HOA / sectional-title management is a Firm-tier feature; below Firm → /403.
 */
import { requireCapability, requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/hoa")
  await requireCapability("properties")
  return children
}
