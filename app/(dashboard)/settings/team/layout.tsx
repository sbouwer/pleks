/**
 * app/(dashboard)/settings/team/layout.tsx — RBAC P4 route guard ('team' capability; owner/is_admin exempt)
 *
 * Notes: Gates the Members + Roles surface. Member-role mutations also re-validate server-side
 *        (assignableRoleSlugs); role-library edits stay owner-only in orgRoles.
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("team")
  return children
}
