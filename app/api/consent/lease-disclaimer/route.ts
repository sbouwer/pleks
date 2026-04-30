/**
 * app/api/consent/lease-disclaimer/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextResponse } from "next/server"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"

export async function GET() {
  const accepted = await hasAcceptedLeaseDisclaimer()
  return NextResponse.json({ accepted })
}
