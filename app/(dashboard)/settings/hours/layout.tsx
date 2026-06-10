/**
 * app/(dashboard)/settings/hours/layout.tsx — RBAC P4 route guard ('org' capability; owner/is_admin exempt)
 *
 * Notes: Opening-hours org-config surface (folds under Organisation on desktop, standalone on mobile). No
 *        tier floor; org-type relevance (hasOpeningHours) is handled in the nav, not here.
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("org")
  return children
}
