/**
 * app/(dashboard)/listings/layout.tsx — RBAC P4 route guard ('applications' capability; owner/is_admin exempt)
 * Route:  /listings (+ nested [slug]/applications/[id], [slug]/compare)
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("applications")
  return children
}
