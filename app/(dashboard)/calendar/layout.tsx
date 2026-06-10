/**
 * app/(dashboard)/calendar/layout.tsx — RBAC P4 tier route guard (Portfolio+; hard-block, not just nav)
 *
 * Auth:  Portfolio tier or higher (canonical tier; not exempt for owner/admin — it's a plan feature).
 * Notes: The calendar is a cross-cutting view with no single capability; tier is its only gate.
 */
import { requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/calendar")
  return children
}
