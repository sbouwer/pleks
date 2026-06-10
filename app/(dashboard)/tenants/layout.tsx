/**
 * app/(dashboard)/tenants/layout.tsx — RBAC P4 route guard ('tenants' capability; owner/is_admin exempt)
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("tenants")
  return children
}
