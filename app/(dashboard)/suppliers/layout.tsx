/**
 * app/(dashboard)/suppliers/layout.tsx — RBAC P4 route guard ('maintenance' capability; owner/is_admin exempt)
 *
 * Notes: Suppliers are the contractor pool for maintenance — gated on the maintenance capability.
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("maintenance")
  return children
}
