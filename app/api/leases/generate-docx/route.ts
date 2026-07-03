/**
 * app/api/leases/generate-docx/route.ts — render an existing lease to a DOCX + return a signed URL
 *
 * Route:  POST /api/leases/generate-docx
 * Auth:   gateway() (agent session + org membership)
 * Data:   generateLeaseDocument(leaseId, orgId), documents storage bucket (signed URL)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — rendering an existing lease's
 *         document (even non-preview) is "your data, always"; lockdown belongs on lease creation,
 *         not rendering. orgId comes from the gateway session.
 */
import { NextRequest, NextResponse } from "next/server"
import { generateLeaseDocument } from "@/lib/leases/generateDocument"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  // Config write → gateway() (no lockdown): rendering the org's own existing lease, "your data, always".
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { leaseId, preview } = await req.json()

  if (!leaseId) {
    return NextResponse.json({ error: "leaseId required" }, { status: 400 })
  }

  const result = await generateLeaseDocument(leaseId, orgId, preview === true)

  // Get a signed download URL
  const { data: signedUrl, error: signedUrlError } = await db.storage
    .from("documents")
    .createSignedUrl(result.storagePath, 3600)
    logQueryError("POST documents", signedUrlError) // 1 hour

  return NextResponse.json({
    ok: true,
    storagePath: result.storagePath,
    clauseSnapshot: result.clauseSnapshot,
    downloadUrl: signedUrl?.signedUrl ?? null,
  })
}
