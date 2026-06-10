/**
 * app/(dashboard)/settings/import/layout.tsx — RBAC P4 route guard ('org' capability; owner/is_admin exempt)
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("org")
  return children
}
