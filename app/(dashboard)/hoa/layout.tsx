/**
 * app/(dashboard)/hoa/layout.tsx — RBAC P4 route guard ('properties' capability; owner/is_admin exempt)
 *
 * Notes: HOA / scheme management is a property-operations area — gated on the properties capability (on top
 *        of the org-type gate that hides it for non-HOA orgs).
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("properties")
  return children
}
