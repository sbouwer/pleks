/**
 * app/(dashboard)/settings/branding/layout.tsx — RBAC P4 route guard ('org' capability; owner/is_admin exempt)
 *
 * Notes: Org-config surface (folds under Organisation on desktop, standalone on mobile). No tier floor —
 *        branding stays available to the free Owner.
 */
import { requireCapability } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireCapability("org")
  return children
}
