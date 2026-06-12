/**
 * app/(dashboard)/settings/templates/layout.tsx — RBAC P4 route guard for the Templates settings
 *
 * Route:  /settings/templates  (renamed from /settings/documents — redirected in next.config)
 * Auth:   'documents' capability (owner/is_admin exempt) + Steward+ tier (paid feature; not exempt).
 */
import { requireCapability, requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/settings/templates")
  await requireCapability("documents")
  return children
}
