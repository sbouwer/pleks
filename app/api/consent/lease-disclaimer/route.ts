/**
 * app/api/consent/lease-disclaimer/route.ts — has the current user accepted the lease disclaimer?
 *
 * Route:  GET /api/consent/lease-disclaimer
 * Auth:   delegated to hasAcceptedLeaseDisclaimer() (resolves the current session)
 * Data:   consent lookup via lib/leases/disclaimer
 */
import { NextResponse } from "next/server"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"

export async function GET() {
  const accepted = await hasAcceptedLeaseDisclaimer()
  return NextResponse.json({ accepted })
}
