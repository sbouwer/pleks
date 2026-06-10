/**
 * app/(dashboard)/settings/import/layout.tsx — RBAC P4 route guard
 *
 * Auth: 'org' capability (owner/is_admin exempt) + Steward+ tier (paid feature; not exempt).
 */
import { requireCapability, requireMinTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireMinTier("steward")
  await requireCapability("org")
  return children
}
