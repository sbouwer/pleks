/**
 * app/(dashboard)/settings/lease-templates/layout.tsx — RBAC P4 route guard
 *
 * Auth: 'documents' capability (owner/is_admin exempt) + Steward+ tier (it's part of the Documents feature;
 *        folded under Documents on desktop, a standalone route on mobile — guard it directly either way).
 */
import { requireCapability, requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/settings/lease-templates")
  await requireCapability("documents")
  return children
}
