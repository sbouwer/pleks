/**
 * app/(dashboard)/reports/layout.tsx — RBAC P4 route guard ('reports' capability; owner/is_admin exempt)
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("reports")
  return children
}
