import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateLeaseDocument } from "@/lib/leases/generateDocument"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { leaseId, preview } = await req.json()

  if (!leaseId) {
    return NextResponse.json({ error: "leaseId required" }, { status: 400 })
  }

  const result = await generateLeaseDocument(leaseId, membership.org_id, preview === true)

  // Get a signed download URL
  const serviceSupabase = await createServiceClient()
  const { data: signedUrl } = await serviceSupabase.storage
    .from("documents")
    .createSignedUrl(result.storagePath, 3600) // 1 hour

  return NextResponse.json({
    ok: true,
    storagePath: result.storagePath,
    clauseSnapshot: result.clauseSnapshot,
    downloadUrl: signedUrl?.signedUrl ?? null,
  })
}
