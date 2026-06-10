/**
 * app/(tenant)/tenant/layout.tsx — Tenant portal root layout (server auth guard + chrome)
 *
 * Route:  /tenant/*
 * Auth:   getTenantSession — redirects to /login when there's no active tenant session. Defence-in-depth: pages
 *         still call getTenantSession, but the layout is now the boundary so a page that forgets can't leak.
 * Notes:  Interactive chrome lives in TenantPortalShell (client). getTenantSession is React.cache'd, so this
 *         guard dedupes with the pages' own calls — no extra DB cost (ADDENDUM_AUTH_HARDENING P-1).
 */
import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { TenantPortalShell } from "@/components/layout/TenantPortalShell"

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  return <TenantPortalShell>{children}</TenantPortalShell>
}
