/**
 * app/(dashboard)/settings/documents/layout.tsx — RBAC P4 route guard
 *
 * Auth: 'documents' capability (owner/is_admin exempt) + Steward+ tier (paid feature; not exempt).
 */
import { requireCapability, requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/settings/documents")
  await requireCapability("documents")
  return children
}
