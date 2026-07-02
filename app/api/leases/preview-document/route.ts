/**
 * app/api/leases/preview-document/route.ts — signed download URL for a generated SAMPLE lease document
 *
 * Route:  GET /api/leases/preview-document?leaseType=residential|commercial
 * Auth:   gateway() (agent session + org membership); gated off the free (owner) tier
 * Data:   generateSampleLeaseDocument(orgId, leaseType) → documents storage signed URL (30m).
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { generateSampleLeaseDocument } from "@/lib/leases/generateSampleDocument"

export async function GET(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Sample downloads are not available on the free (owner) tier
  const tier = await getOrgTier(orgId)
  if (tier === "owner") {
    return NextResponse.json(
      { error: "upgrade_required", message: "Sample downloads are available on paid plans." },
      { status: 403 }
    )
  }

  const rawLeaseType = req.nextUrl.searchParams.get("leaseType") ?? "residential"
  const leaseType = rawLeaseType === "commercial" ? "commercial" : "residential"

  const { storagePath } = await generateSampleLeaseDocument(orgId, leaseType)

  // Short-lived signed URL — sample files are temporary
  const { data: signed, error: signErr } = await db.storage
    .from("documents")
    .createSignedUrl(storagePath, 1800) // 30 minutes

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Failed to create download link" }, { status: 500 })
  }

  return NextResponse.json({ downloadUrl: signed.signedUrl })
}
