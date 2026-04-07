import { NextResponse } from "next/server"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"

export async function GET() {
  const accepted = await hasAcceptedLeaseDisclaimer()
  return NextResponse.json({ accepted })
}
