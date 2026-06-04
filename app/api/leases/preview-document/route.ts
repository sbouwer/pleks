/**
 * app/api/leases/preview-document/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { generateSampleLeaseDocument } from "@/lib/leases/generateSampleDocument"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("GET user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  // Sample downloads are not available on the free (owner) tier
  const tier = await getOrgTier(membership.org_id)
  if (tier === "owner") {
    return NextResponse.json(
      { error: "upgrade_required", message: "Sample downloads are available on paid plans." },
      { status: 403 }
    )
  }

  const rawLeaseType = req.nextUrl.searchParams.get("leaseType") ?? "residential"
  const leaseType = rawLeaseType === "commercial" ? "commercial" : "residential"

  const { storagePath } = await generateSampleLeaseDocument(membership.org_id, leaseType)

  // Short-lived signed URL — sample files are temporary
  const { data: signed, error: signErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 1800) // 30 minutes

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Failed to create download link" }, { status: 500 })
  }

  return NextResponse.json({ downloadUrl: signed.signedUrl })
}
