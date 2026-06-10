/**
 * app/(dashboard)/properties/layout.tsx — RBAC P4 route guard ('properties' capability; owner/is_admin exempt)
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("properties")
  return children
}
