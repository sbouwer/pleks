/**
 * app/api/leases/generate-docx/route.ts — render an existing lease to a DOCX + return a signed URL
 *
 * Route:  POST /api/leases/generate-docx
 * Auth:   gateway() (agent session + org membership)
 * Data:   generateLeaseDocument(leaseId, orgId), documents storage bucket (signed URL)
 * Notes:  Config write → gateway(), not requireAgentWriteAccess — rendering an existing lease's
 *         document (even non-preview) is "your data, always"; lockdown belongs on lease creation,
 *         not rendering. orgId comes from the gateway session. 409 when the lease's source is one Pleks does
 *         not render (lib/leases/leaseSource.ts).
 */
import { NextRequest, NextResponse } from "next/server"
import { generateLeaseDocument, LeaseNotRenderedError } from "@/lib/leases/generateDocument"
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

  let result: Awaited<ReturnType<typeof generateLeaseDocument>>
  try {
    result = await generateLeaseDocument(leaseId, orgId, preview === true)
  } catch (err) {
    if (err instanceof LeaseNotRenderedError) {
      return NextResponse.json({ error: "This lease uses your own document, so Pleks does not generate one" }, { status: 409 })
    }
    console.error("generate-docx: generation failed for lease", leaseId, err)
    return NextResponse.json({ error: "Could not generate the lease document" }, { status: 500 })
  }

  // Signed download URL, 1 hour. The document IS generated and stored by now (the generator throws otherwise), so a
  // sign failure is not a generation failure: answer ok with a null link rather than tell the agent it failed.
  const { data: signedUrl, error: signedUrlError } = await db.storage
    .from("documents")
    .createSignedUrl(result.storagePath, 3600)
  logQueryError("POST documents", signedUrlError)

  return NextResponse.json({
    ok: true,
    storagePath: result.storagePath,
    clauseSnapshot: result.clauseSnapshot,
    downloadUrl: signedUrl?.signedUrl ?? null,
  })
}
