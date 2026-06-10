/**
 * app/(dashboard)/settings/deposits/layout.tsx — RBAC P4 route guard (Trust account)
 *
 * Auth:  'finance' capability (owner/is_admin exempt) + Steward+ tier (paid feature; not exempt).
 */
import { requireCapability, requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/settings/deposits")
  await requireCapability("finance")
  return children
}
