/**
 * app/(landlord)/landlord/layout.tsx — Landlord/owner portal root layout (server auth guard + chrome)
 *
 * Route:  /landlord/*
 * Auth:   getLandlordSession — redirects to /login when there's no active landlord session (it redirects
 *         internally). Defence-in-depth: pages still call it, but the layout is now the boundary.
 * Notes:  Interactive chrome lives in LandlordPortalShell (client). getLandlordSession is React.cache'd, so this
 *         guard dedupes with the pages' own calls — no extra DB cost (ADDENDUM_AUTH_HARDENING P-1).
 */
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { LandlordPortalShell } from "@/components/layout/LandlordPortalShell"

export default async function LandlordPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await getLandlordSession()  // redirects to /login if there's no active landlord session

  return <LandlordPortalShell>{children}</LandlordPortalShell>
}
